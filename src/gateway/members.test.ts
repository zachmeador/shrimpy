import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type Member, NEEDS_ADMIN } from "../contracts/gateway/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { inRuntimeDir, stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { RosterOwnedError } from "./index.ts";
import { invited, LOOPBACK, startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;

const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

test("an agent that joins is the same member when it signs in again, also after the gateway has restarted", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  const first = await startGatewayInProcess(t, { dataDir });
  const joining = await connectLocalGateway();
  const token = newToken();
  const member = await joining.join("scout", token);
  assert.equal(member.kind, "agent");
  assert.equal(member.name, "scout");
  assert.match(member.id, /^mem_[0-9a-z]{12}$/);
  await joining.close();
  await first.close();

  const second = await startGatewayInProcess(t, { dataDir });
  const returning = await connectLocalGateway();
  stopAfter(t, () => returning.close());
  try {
    assert.deepEqual(await returning.signIn(token, "scout"), member);
    const roster = await returning.members();
    assert.deepEqual(roster.map((each) => each.name), [userInfo().username, "scout"]);
    assert.equal(roster[1]?.id, member.id);
  } finally {
    await second.close();
  }

  const stored = readFileSync(rosterFile(dataDir), "utf8");
  assert.ok(!stored.includes(token), "the roster keeps a hash of the token, not the token");
  assert.equal(statSync(rosterFile(dataDir)).mode & 0o777, 0o600, "and only its owner can read it");
});

test("a token the roster does not have is refused, and so is a second gateway on the same roster", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  const gateway = await startGatewayInProcess(t, { dataDir });
  const client = await connectLocalGateway();
  stopAfter(t, () => client.close());
  try {
    await assert.rejects(client.signIn("not-a-token", null), /does not know that token/);

    const elsewhere = tempDir(t, "rt-elsewhere");
    await assert.rejects(inRuntimeDir(elsewhere, () => startGatewayInProcess(t, { dataDir })), RosterOwnedError);
  } finally {
    await gateway.close();
  }
});

test("a name another member has is refused, whatever the case, and a rename keeps the member", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const [scout, other, renamer, later] = await Promise.all([1, 2, 3, 4].map(() => connectLocalGateway()));
  for (const connection of [scout, other, renamer, later]) stopAfter(t, () => connection?.close());
  try {
    const token = newToken();
    const member = await scout!.join("scout", token);

    await assert.rejects(other!.join("SCOUT", newToken()), /"SCOUT" is taken: it belongs to the agent "scout".*Choose another/);
    await assert.rejects(other!.join(userInfo().username, newToken()), /belongs to the person/);
    const mechanicToken = newToken();
    const mechanic = await other!.join("mechanic", mechanicToken);
    await assert.rejects(
      other!.signIn(mechanicToken, "Scout"),
      /"Scout" is taken/,
      "a member cannot take a name by renaming either",
    );

    assert.deepEqual(await renamer!.signIn(token, "scout2"), { ...member, name: "scout2" });
    const agents = (await renamer!.members()).filter((each) => each.kind === "agent");
    assert.deepEqual(
      agents.map((each) => [each.id, each.name]),
      [
        [member.id, "scout2"],
        [mechanic.id, "mechanic"],
      ],
    );
    assert.equal((await later!.signIn(token, null)).name, "scout2", "no name keeps the roster's");
  } finally {
    await gateway.close();
  }
});

test("the person who runs the gateway is on the roster from the start, and nobody says who they are", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const client = await connectLocalGateway();
  stopAfter(t, () => client.close());
  try {
    const [first, ...others] = await client.members();

    assert.deepEqual(others, []);
    assert.equal(first?.kind, "person");
    assert.equal(first.name, userInfo().username);
    assert.equal(first.reachable, false, "no program is registered as them");
  } finally {
    await gateway.close();
  }
});

test("the first agent a roster has is an admin from the moment it joins, on the gateway's own socket or over the entry, and no agent after it is, also when the first is demoted", { timeout }, async (t) => {
  useRuntimeDir(t);
  for (const apart of [false, true]) {
    const way = apart ? "over the entry" : "on the gateway's own socket";
    const gateway = await startGatewayInProcess(t, { listen: LOOPBACK });
    const person = await connectLocalGateway();
    stopAfter(t, () => person.close());
    const join = async (name: string): Promise<Member> => {
      if (apart) return (await invited(t, gateway, person, name)).member;
      const connection = await connectLocalGateway();
      stopAfter(t, () => connection.close());
      return connection.join(name, newToken());
    };

    const first = await join("scout");
    const second = await join("rex");
    assert.deepEqual([first.admin, second.admin], [true, false], way);

    // The first agent is the one that joined first, not the one that is the only admin: demoting it makes no other the first.
    await person.demote(first.id);
    assert.equal((await join("maya")).admin, false, way);
    assert.deepEqual(
      (await person.members()).map((member) => [member.name, member.admin]),
      [[userInfo().username, true], ["scout", false], ["rex", false], ["maya", false]],
      way,
    );
    await gateway.close();
  }
});

test("a roster written before there was a role is read with no agent an admin, and every person is one", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  const token = newToken();
  // The roster as the gateway wrote it before the role: no member has an admin field.
  mkdirSync(dirname(rosterFile(dataDir)), { recursive: true });
  writeFileSync(
    rosterFile(dataDir),
    JSON.stringify({
      version: 1,
      members: [
        { id: "mem_aaaaaaaaaaaa", kind: "person", name: userInfo().username, recognizedBy: { osUser: userInfo().username } },
        {
          id: "mem_bbbbbbbbbbbb",
          kind: "agent",
          name: "scout",
          recognizedBy: { tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}` },
        },
      ],
    }),
  );
  const gateway = await startGatewayInProcess(t, { dataDir });
  const client = await connectLocalGateway();
  stopAfter(t, () => client.close());
  try {
    const roster = await client.members();

    assert.deepEqual(
      roster.map((member) => [member.name, member.kind, member.admin]),
      [
        [userInfo().username, "person", true],
        ["scout", "agent", false],
      ],
    );
    assert.deepEqual(await client.signIn(token, null), { id: "mem_bbbbbbbbbbbb", kind: "agent", name: "scout", admin: false }, "and the agent is still recognized");
  } finally {
    await gateway.close();
  }
});

test("a person or an admin promotes and demotes agents, anyone else is refused, and the role outlives the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  const first = await startGatewayInProcess(t, { dataDir });
  const [person, scoutConnection, rexConnection] = await Promise.all([1, 2, 3].map(() => connectLocalGateway()));
  for (const connection of [person, scoutConnection, rexConnection]) stopAfter(t, () => connection?.close());
  const scout = await scoutConnection!.join("scout", newToken());
  const rex = await rexConnection!.join("rex", newToken());
  const adminsOf = async (): Promise<string[]> =>
    (await person!.members()).filter((member) => member.admin).map((member) => member.name);
  // The first agent a roster has is an admin, so scout is made an ordinary agent, as rex is.
  await person!.demote(scout.id);
  assert.deepEqual(await adminsOf(), [userInfo().username], "and no agent is an admin");

  // An agent that is not an admin may not, and the refusal says why in a way a caller can tell without reading it.
  const attempts = [() => scoutConnection!.promote(rex.id), () => scoutConnection!.demote(rex.id), () => rexConnection!.promote(rex.id)];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (error: unknown) => isRefusal(error) && reasonOf(error) === NEEDS_ADMIN);
  }
  assert.deepEqual(await adminsOf(), [userInfo().username], "and nothing changed");

  // The person may, and an agent that was just promoted may on the connection it already had: the gateway reads the roster as it is.
  assert.equal((await person!.promote(scout.id)).admin, true);
  assert.equal((await person!.promote(scout.id)).admin, true, "promoting an admin is not an error");
  assert.equal((await scoutConnection!.promote(rex.id)).admin, true);
  assert.deepEqual(await adminsOf(), [userInfo().username, "scout", "rex"]);
  assert.equal((await scoutConnection!.demote(rex.id)).admin, false, "an admin demotes another");

  // A person is always an admin, so there is nothing to promote or demote, and a member the roster does not have is refused.
  const [self] = await person!.members();
  await assert.rejects(person!.demote(self?.id ?? ""), isRefusal);
  await assert.rejects(person!.promote("mem_nobody"), isRefusal);

  await first.close();
  const second = await startGatewayInProcess(t, { dataDir });
  try {
    const returning = await connectLocalGateway();
    stopAfter(t, () => returning.close());
    assert.deepEqual(
      (await returning.members()).map((member) => [member.name, member.admin]),
      [
        [userInfo().username, true],
        ["scout", true],
        ["rex", false],
      ],
    );
  } finally {
    await second.close();
  }
});
