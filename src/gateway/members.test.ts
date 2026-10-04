import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { inRuntimeDir, stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { RosterOwnedError } from "./index.ts";
import { startTestGateway } from "./testing/index.ts";

const timeout = 30_000;

const rosterFile = (dataDir: string): string => join(dataDir, "state", "roster.json");

test("an agent that joins is the same member when it signs in again, also after the gateway has restarted", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  const first = await startTestGateway(t, { dataDir });
  const joining = await connectLocalGateway();
  const { member, token } = await joining.join("scout");
  assert.equal(member.kind, "agent");
  assert.equal(member.name, "scout");
  assert.match(member.id, /^mem_[0-9a-z]{12}$/);
  await joining.close();
  await first.close();

  const second = await startTestGateway(t, { dataDir });
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
  const gateway = await startTestGateway(t, { dataDir });
  const client = await connectLocalGateway();
  stopAfter(t, () => client.close());
  try {
    await assert.rejects(client.signIn("not-a-token", null), /does not know that token/);

    const elsewhere = tempDir(t, "rt-elsewhere");
    await assert.rejects(inRuntimeDir(elsewhere, () => startTestGateway(t, { dataDir })), RosterOwnedError);
  } finally {
    await gateway.close();
  }
});

test("a name another member has is refused, whatever the case, and a rename keeps the member", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  const [scout, other, renamer, later] = await Promise.all([1, 2, 3, 4].map(() => connectLocalGateway()));
  for (const connection of [scout, other, renamer, later]) stopAfter(t, () => connection?.close());
  try {
    const { member, token } = await scout!.join("scout");

    await assert.rejects(other!.join("SCOUT"), /"SCOUT" is taken: it belongs to the agent "scout".*Choose another/);
    await assert.rejects(other!.join(userInfo().username), /belongs to the person/);
    const mechanic = await other!.join("mechanic");
    await assert.rejects(
      other!.signIn(mechanic.token, "Scout"),
      /"Scout" is taken/,
      "a member cannot take a name by renaming either",
    );

    assert.deepEqual(await renamer!.signIn(token, "scout2"), { ...member, name: "scout2" });
    const agents = (await renamer!.members()).filter((each) => each.kind === "agent");
    assert.deepEqual(
      agents.map((each) => [each.id, each.name]),
      [
        [member.id, "scout2"],
        [mechanic.member.id, "mechanic"],
      ],
    );
    assert.equal((await later!.signIn(token, null)).name, "scout2", "no name keeps the roster's");
  } finally {
    await gateway.close();
  }
});

test("the person who runs the gateway is on the roster from the start, and nobody says who they are", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
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
