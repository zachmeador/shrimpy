import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Registration } from "../../../contracts/gateway/index.ts";
import { keepRegistered } from "../../../contracts/gateway/node.ts";
import { startStandInGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { quick, startRegistry } from "./testing/index.ts";
import { localTransports } from "./transports.ts";

const timeout = 15_000;

const program = (kind: "agent" | "chat", name: string): Registration => ({
  kind,
  name,
  serverId: `${name}-id`,
  socket: `/tmp/${name}.sock`,
  pid: 4242,
  version: SHRIMPY_VERSION,
});

/** Register a program with the gateway, as an agent or the chat server does; it is gone when `stop` is called or the test ends. */
function register(t: TestContext, registration: Registration) {
  const kept = keepRegistered(registration, { backoff: quick() });
  stopAfter(t, () => kept.stop());
  return kept;
}

test("it lists what the gateway lists, with the gateway's version, and follows programs that come and go", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t, { version: "9.9.9" });
  const registry = startRegistry(t);
  await until(() => registry.status().state === "up", "the gateway to be reached");

  const scout = register(t, program("agent", "scout"));
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed" });
  register(t, program("chat", "chat"));
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 2, { what: "the chat server to be listed" });

  assert.deepEqual(
    registry.listing()?.programs.map((listed) => `${listed.kind} ${listed.name}`),
    ["agent scout", "chat chat"],
  );
  assert.equal(registry.listing()?.version, "9.9.9");
  await scout.stop();
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to go" });
});

test("with no gateway running it says so, and finds the gateway when it starts", { timeout }, async (t) => {
  useRuntimeDir(t);
  const registry = startRegistry(t);
  const changes: number[] = [];
  registry.onChange(() => changes.push(changes.length));

  await until(
    () => JSON.stringify(registry.status()) === JSON.stringify({ state: "down", why: { kind: "not-running" } }),
    "nothing running",
  );
  assert.equal(registry.listing(), undefined);
  await startStandInGateway(t);

  await until(() => registry.status().state === "up", "the gateway to be reached");
  await eventually(() => registry.listing(), (listing) => listing !== undefined, { what: "a listing" });
  assert.deepEqual(registry.listing()?.programs, []);
  assert.ok(changes.length >= 2, "the changes were announced");
});

test("when the gateway goes away the last listing stays, and the registry comes back with the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const registry = startRegistry(t);
  register(t, program("agent", "scout"));
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed" });

  await gateway.close();

  await until(() => registry.status().state === "down", "the loss to be noticed");
  assert.deepEqual(
    registry.listing()?.programs.map((listed) => listed.name),
    ["scout"],
    "what was last known stays",
  );
  await startStandInGateway(t);
  await until(() => registry.status().state === "up", "the gateway to be reached again");
  // Scout registers again on its own when the gateway is back.
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed again" });
});

test("it waits for a program to be listed, and gives up when told to", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const registry = startRegistry(t);
  const waited: string[] = [];

  const waiting = registry.untilListed(
    (listed) => listed.name === "scout",
    new AbortController().signal,
    () => waited.push("waiting"),
  );
  register(t, program("agent", "scout"));
  assert.equal((await waiting).name, "scout");
  assert.deepEqual(waited, ["waiting"]);
  assert.equal((await registry.untilListed((listed) => listed.name === "scout", new AbortController().signal)).name, "scout");

  const abandon = new AbortController();
  const never = registry.untilListed((listed) => listed.name === "nobody", abandon.signal);
  abandon.abort(new Error("enough"));
  await assert.rejects(never, /enough/);
});

test("the newest of programs with the same name is the one found", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const registry = startRegistry(t);
  register(t, { ...program("agent", "scout"), pid: 1 });
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "the first scout" });
  register(t, { ...program("agent", "scout"), pid: 2 });
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 2, { what: "the second scout" });

  assert.equal((await registry.untilListed((listed) => listed.name === "scout", new AbortController().signal)).pid, 2);
});

test("it reaches the gateway through the transport it is handed", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const local = localTransports();
  let used = 0;
  const registry = startRegistry(t, {
    transports: {
      ...local,
      gateway: (handlers) => {
        used += 1;
        return local.gateway(handlers);
      },
    },
  });

  await until(() => registry.status().state === "up", "the gateway to be reached through it");

  assert.equal(used, 1);
});

test("closing stops it at once, even while the gateway is not there", { timeout }, async (t) => {
  useRuntimeDir(t);
  const registry = startRegistry(t);
  await until(() => registry.status().state === "down", "the first attempt to fail");

  await within(2000, registry.close(), "closing");
});
