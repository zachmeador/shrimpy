import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { HelloRefusedError, Roster } from "../contracts/gateway/index.ts";
import { newToken, sayHello } from "../contracts/gateway/node.ts";
import { migrationCopy } from "../lib/migration/node.ts";
import { tempDir, until } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { connectTestClient, Echo, linkTestAgent } from "../contracts/gateway/testing/index.ts";
import { openRoster, ROSTER_FORMAT, type RosterStep } from "./roster/index.ts";
import { startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a client holding the roster sees an agent arrive, and become reachable once its program is linked", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const you = await connectTestClient(t, place);
  const roster = you.host.hold(Roster, {}, context);
  await until(() => roster.state.value.kind === "live", "the roster to bind");
  if (roster.variant !== "all") throw new Error("The roster has no variant.");
  assert.equal(roster.you.value?.kind, "person");
  assert.deepEqual(roster.members.value.map(({ name, reachable }) => ({ name, reachable })), [{ name: you.you?.name, reachable: false }]);

  await linkTestAgent(t, "scout", { place });

  await until(
    () => roster.members.value.some((member) => member.name === "scout" && member.reachable),
    "scout to arrive on the roster and be reachable",
  );
  const scout = roster.members.value.find((member) => member.name === "scout");
  assert.equal(scout?.kind, "agent");
  assert.equal(scout.admin, true, "the first agent is an admin");
  assert.deepEqual(roster.programs.value, [{ kind: "agent", name: "scout", member: scout.id, shrimpy: SHRIMPY_VERSION }]);
});

test("taking a device's token back ends what it holds as revoked, closes its link, and lets it in no more", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.fingerprint };
  const you = await connectTestClient(t, { path: gateway.socket });
  const yours = await you.host.get(Roster, {}, context);
  const scout = await linkTestAgent(t, "scout", { place: { path: gateway.socket } });

  const invitation = await yours.inviteDevice(context);
  assert.equal(invitation.kind, "done");
  const token = newToken();
  const joined = await sayHello(entry, { kind: "join", name: null, token, code: invitation.value.code, machine: "laptop" });
  joined.linked.drop();
  assert.equal(joined.welcome.you?.id, you.you?.id, "a device is you");

  const device = await connectTestClient(t, entry, token);
  const roster = await device.host.get(Roster, {}, context);
  const echo = device.host.hold(Echo, { agent: scout.you.id }, context);
  await until(() => echo.state.value.kind === "live", "the device's hold at scout to bind");
  if (echo.variant !== "only") return;
  await until(() => yours.ways.value.some((each) => each.kind === "device"), "you to see the device's way in");
  const way = yours.ways.value.find((each) => each.kind === "device");
  assert.deepEqual(echo.caller.value, { kind: "person", member: you.you?.id, way: { kind: "device", id: way?.id } });
  assert.equal(way?.label, "laptop", "the device is labelled with the machine it joined from");

  const taken = await yours.takeBack({ way: way.id }, context);
  assert.equal(taken.kind, "done");

  await until(() => roster.state.value.kind === "ended", "the device's roster to end");
  const ended = roster.state.value;
  assert.ok(ended.kind === "ended" && ended.error.code === "forbidden" && ended.error.reason === "revoked");
  await device.closed;
  assert.notEqual(echo.state.value.kind, "live");
  assert.equal(yours.state.value.kind, "live", "your own link is untouched");
  await until(() => !yours.ways.value.some((each) => each.kind === "device"), "the device's way to go");
  await assert.rejects(
    connectTestClient(t, entry, token),
    (error) => error instanceof HelloRefusedError && error.reason === "unknown_token",
  );
});

test("a roster of an older version is refused and left as it is", { timeout }, async (t) => {
  for (const old of [
    JSON.stringify({ version: 1, members: [{ id: "mem_you", kind: "person", name: "zach", recognizedBy: { osUser: "zach" } }] }),
    JSON.stringify({ version: 2, members: [{ id: "mem_you", kind: "person", name: "zach" }], ways: [] }),
  ]) {
    const dataDir = tempDir(t, "gateway-data");
    const file = join(dataDir, "state", "roster.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, old);

    await assert.rejects(startGatewayInProcess(t, { dataDir }), (error: Error) => error.message.includes(dataDir));

    assert.equal(readFileSync(file, "utf8"), old);
    assert.equal(existsSync(join(dataDir, "state", "key.pem")), false);
  }
});

test("a roster 1.0.0 wrote is copied aside and brought up to date, and every member keeps its ID and its way in", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const file = join(dataDir, "state", "roster.json");
  const token = newToken();
  const deviceToken = newToken();
  const hashOf = (shown: string): string => `sha256:${createHash("sha256").update(shown).digest("hex")}`;
  // As 1.0.0 writes it.
  const written = `${JSON.stringify(
    {
      version: 3,
      id: "ros_from1point0",
      members: [
        { id: "mem_you", kind: "person", name: "zach", recognizedBy: { machines: [{ tokenHash: hashOf(deviceToken), label: "laptop" }] } },
        { id: "mem_scout", kind: "agent", name: "scout", admin: true, recognizedBy: { tokenHash: hashOf(token) } },
      ],
    },
    null,
    2,
  )}\n`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, written);

  const gateway = await startGatewayInProcess(t, { dataDir, account: "zach" });
  assert.equal(readFileSync(migrationCopy(file), "utf8"), written, "the copy is the roster as 1.0.0 left it");
  const place = { path: gateway.socket };
  const scout = await linkTestAgent(t, "scout", { place, token, roster: "ros_from1point0" });
  assert.deepEqual([scout.you.id, scout.you.admin, scout.roster], ["mem_scout", true, "ros_from1point0"]);
  const device = await connectTestClient(t, place, deviceToken);
  assert.equal(device.you?.id, "mem_you");

  // What 2.0 added to the file works on it: a removed agent's token is turned away as removed.
  const roster = await device.host.get(Roster, {}, context);
  assert.equal((await roster.remove({ member: "mem_scout" }, context)).kind, "done");
  await scout.stop();
  await assert.rejects(
    connectTestClient(t, place, token),
    (error) => error instanceof HelloRefusedError && error.reason === "removed",
  );
});

test("the next release copies the roster aside and migrates it, and this one then refuses it, naming the copy, until the copy is put back", (t) => {
  const dataDir = tempDir(t, "gateway-update");
  const file = join(dataDir, "state", "roster.json");
  const token = newToken();
  const names = (roster: { members(): { name: string }[] }): string[] => roster.members().map((member) => member.name);
  // The next release keeps every name in lower case.
  const lowerCase: RosterStep = {
    version: ROSTER_FORMAT.current + 1,
    migrate: (roster) => ({ ...roster, members: (roster.members as { name: string }[]).map((member) => ({ ...member, name: member.name.toLowerCase() })) }),
  };
  const next = { ...ROSTER_FORMAT, current: lowerCase.version, steps: [...ROSTER_FORMAT.steps, lowerCase] };
  assert.equal(openRoster(dataDir, "Zach").join("Scout", token).kind, "done");

  const updated = openRoster(dataDir, "Zach", next);
  assert.deepEqual(names(updated), ["zach", "scout"]);
  assert.equal(updated.recognize(token)?.member.name, "scout");
  const copy = migrationCopy(file);
  assert.ok(existsSync(copy));

  assert.throws(
    () => openRoster(dataDir, "Zach"),
    (error: Error) => error.message.includes(copy),
  );

  renameSync(copy, file);
  assert.deepEqual(names(openRoster(dataDir, "Zach")), ["Zach", "Scout"]);
});

test("taking back an agent's token keeps its entry, and inviting it again replaces the token and drops the old link", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.fingerprint };
  const you = await connectTestClient(t, { path: gateway.socket });
  const yours = await you.host.get(Roster, {}, context);
  const rosterId = yours.id.value;
  assert.match(rosterId, /^ros_/);

  // First invite + join creates scout with a token.
  const firstInvite = await yours.invite({ name: "scout" }, context);
  assert.equal(firstInvite.kind, "done");
  const firstToken = newToken();
  const joined = await sayHello(entry, { kind: "join", name: "scout", token: firstToken, code: firstInvite.value.code, machine: "box-1" });
  joined.linked.drop();
  assert.equal(joined.welcome.roster, rosterId);
  const scoutId = joined.welcome.you?.id;
  assert.ok(scoutId !== undefined);

  const running = await linkTestAgent(t, "scout", { place: entry, token: firstToken, roster: rosterId });
  const scoutsRoster = await running.host.get(Roster, {}, context);
  await until(() => yours.members.value.some((member) => member.id === scoutId && member.reachable), "scout to be reachable");
  const firstWay = yours.ways.value.find((way) => way.member === scoutId);
  assert.ok(firstWay !== undefined);

  // Inviting an existing agent replaces its token on join, revoking the old way and dropping the old link.
  const secondInvite = await yours.invite({ name: "SCOUT" }, context);
  assert.equal(secondInvite.kind, "done");
  const secondToken = newToken();
  const replaced = await sayHello(entry, { kind: "join", name: "scout", token: secondToken, code: secondInvite.value.code, machine: "box-2" });
  replaced.linked.drop();
  assert.equal(replaced.welcome.you?.id, scoutId, "same member ID");
  assert.equal(replaced.welcome.you.name, "scout", "canonical roster spelling");

  await until(() => scoutsRoster.state.value.kind === "ended", "the old link's roster to end as revoked");
  const ended = scoutsRoster.state.value;
  assert.ok(ended.kind === "ended" && ended.error.code === "forbidden" && ended.error.reason === "revoked");
  await running.stop();
  await assert.rejects(
    connectTestClient(t, entry, firstToken),
    (error) => error instanceof HelloRefusedError && error.reason === "unknown_token",
    "the old token is gone",
  );

  // Taking back the new token leaves scout's entry and name intact, with no way in.
  const secondWay = yours.ways.value.find((way) => way.member === scoutId);
  assert.ok(secondWay !== undefined && secondWay.id !== firstWay.id);
  assert.equal((await yours.takeBack({ way: secondWay.id }, context)).kind, "done");
  await until(() => !yours.ways.value.some((way) => way.member === scoutId), "scout's way to go");
  assert.equal(yours.members.value.some((member) => member.id === scoutId && member.name === "scout" && !member.reachable), true);

  // Inviting the person's name is still refused.
  const personName = you.you?.name ?? "";
  const refused = await yours.invite({ name: personName }, context);
  assert.equal(refused.kind, "refused");
  assert.equal(refused.reason, "name_taken");

  // Roster ID persists across restarts.
  await gateway.close();
  const restarted = await startGatewayInProcess(t, { dataDir: gateway.dataDir });
  const again = await connectTestClient(t, { path: restarted.socket });
  const rosterAgain = await again.host.get(Roster, {}, context);
  assert.equal(rosterAgain.id.value, rosterId);
});

test("removing an agent revokes its link, withdraws its invitations, frees its name, and never reuses its ID", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.fingerprint };
  const place = { path: gateway.socket };
  const you = await connectTestClient(t, place);
  const yours = await you.host.get(Roster, {}, context);
  const scoutToken = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token: scoutToken });
  const rex = await linkTestAgent(t, "rex", { place });
  const scoutsRoster = await scout.host.get(Roster, {}, context);
  const rexsRoster = await rex.host.get(Roster, {}, context);

  // Non-admin agent is refused; person cannot be removed.
  assert.equal((await rexsRoster.remove({ member: scout.you.id }, context)).kind, "refused");
  assert.equal((await yours.remove({ member: you.you?.id ?? "" }, context)).kind, "refused");

  // Issue a replacement invitation before removing scout; removing scout must withdraw it.
  const pending = await yours.invite({ name: "scout" }, context);
  assert.equal(pending.kind, "done");

  assert.equal((await yours.remove({ member: scout.you.id }, context)).kind, "done");
  await until(() => scoutsRoster.state.value.kind === "ended", "scout's roster hold to end as revoked");
  const ended = scoutsRoster.state.value;
  assert.ok(ended.kind === "ended" && ended.error.code === "forbidden" && ended.error.reason === "revoked");
  await scout.stop();
  await until(() => !yours.members.value.some((member) => member.id === scout.you.id), "scout to leave the roster");
  assert.equal(yours.ways.value.some((way) => way.member === scout.you.id), false);
  assert.equal(yours.programs.value.some((program) => program.member === scout.you.id), false);

  // The pending invitation was withdrawn and the old token is turned away as removed.
  await assert.rejects(
    sayHello(entry, { kind: "join", name: "scout", token: newToken(), code: pending.value.code, machine: "box" }),
    HelloRefusedError,
  );
  await assert.rejects(
    connectTestClient(t, entry, scoutToken),
    (error) => error instanceof HelloRefusedError && error.reason === "removed",
  );

  // A new agent can take the freed name and gets a fresh member ID.
  const reborn = await linkTestAgent(t, "scout", { place });
  assert.notEqual(reborn.you.id, scout.you.id);
});

test("reconnecting with another name in hello does not rename the agent", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token });
  await scout.stop();

  const reconnected = await linkTestAgent(t, "other", { place, token });
  assert.equal(reconnected.you.id, scout.you.id);
  assert.equal(reconnected.you.name, "scout");
});
