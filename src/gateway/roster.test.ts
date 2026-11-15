import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Roster } from "../contracts/gateway/index.ts";
import { GatewayRefusedError, joinAsMachine, newToken, readMachine } from "../contracts/gateway/node.ts";
import { tempDir, until } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { connectTestClient, Echo, startTestAgent, startTestGateway } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a client holding the roster sees an agent arrive, and become reachable once its program is linked", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const place = { path: gateway.socket };
  const you = await connectTestClient(t, place);
  const roster = you.host.hold(Roster, {}, context);
  await until(() => roster.state.value.kind === "live", "the roster to bind");
  if (roster.variant !== "all") throw new Error("The roster has no variant.");
  assert.equal(roster.you.value?.kind, "person");
  assert.deepEqual(roster.members.value.map(({ name, reachable }) => ({ name, reachable })), [{ name: you.you?.name, reachable: false }]);

  await startTestAgent(t, { place, name: "scout", token: newToken() });

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
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = { ...address, fingerprint: gateway.fingerprint };
  const you = await connectTestClient(t, { path: gateway.socket });
  const yours = await you.host.get(Roster, {}, context);
  await startTestAgent(t, { place: { path: gateway.socket }, name: "scout", token: newToken() });

  const invitation = await yours.inviteDevice(context);
  assert.equal(invitation.kind, "done");
  const folder = join(tempDir(t, "device"), "shrimpy");
  const { code, fingerprint } = invitation.value;
  const joined = await joinAsMachine(folder, { name: null, address, code, fingerprint }, { machine: "laptop" });
  assert.equal(joined.member.id, you.you?.id, "a device is you");
  const token = readMachine(folder)?.token;
  assert.ok(token !== undefined);

  const device = await connectTestClient(t, entry, token);
  const roster = await device.host.get(Roster, {}, context);
  const echo = device.host.hold(Echo, { agent: "scout" }, context);
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
    (error) => error instanceof GatewayRefusedError && error.reason === "unknown_token",
  );
});

test("a roster from before the move to Pi 1.5.2 is refused and left as it is", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const file = join(dataDir, "state", "roster.json");
  mkdirSync(dirname(file), { recursive: true });
  // As the gateway wrote it until the move: version 1, which found you by the OS account it ran as.
  const old = JSON.stringify({ version: 1, members: [{ id: "mem_you", kind: "person", name: "zach", recognizedBy: { osUser: "zach" } }] });
  writeFileSync(file, old);

  await assert.rejects(startTestGateway(t, { dataDir }), (error: Error) => error.message.includes(dataDir));

  assert.equal(readFileSync(file, "utf8"), old);
  assert.equal(existsSync(join(dataDir, "state", "key.pem")), false);
});
