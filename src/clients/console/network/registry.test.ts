import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import type { Announcement } from "../../../contracts/gateway/index.ts";
import { keepRegistered, newToken } from "../../../contracts/gateway/node.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { quick, startRegistry } from "./testing/index.ts";

const timeout = 30_000;

const announce = (kind: "agent" | "chat", name: string, version = SHRIMPY_VERSION): Announcement => ({
  kind,
  serverId: randomUUID(),
  socket: `/tmp/${name}.sock`,
  version,
});

/** The chat server registers; it is gone when `stop` is called or the test ends. */
function registerChat(t: TestContext, version?: string) {
  const kept = keepRegistered(announce("chat", "chat", version), { backoff: quick() });
  stopAfter(t, () => kept.stop());
  return kept;
}

/**
 * An agent joins the roster as `name` and registers, and signs in with its token
 * and registers again after the gateway has been away. It is gone when `stop` is
 * called or the test ends.
 */
function registerAgent(t: TestContext, name: string) {
  let token: string | undefined;
  const kept = keepRegistered(announce("agent", name), {
    backoff: quick(),
    async signIn(gateway) {
      if (token === undefined) {
        token = newToken();
        await gateway.join(name, token);
      } else await gateway.signIn(token, name);
    },
  });
  stopAfter(t, () => kept.stop());
  return { kept };
}

test("it lists what the gateway lists, with the roster and the gateway's version, and follows programs that come and go", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const registry = startRegistry(t);
  await until(() => registry.status().state === "up", "the gateway to be reached");

  const scout = registerAgent(t, "scout");
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed" });
  registerChat(t);
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 2, { what: "the chat server to be listed" });

  assert.deepEqual(
    registry.listing()?.programs.map((listed) => `${listed.kind} ${listed.name}`),
    ["agent scout", "chat chat"],
  );
  assert.equal(registry.listing()?.version, SHRIMPY_VERSION);
  assert.deepEqual(
    registry.listing()?.members.map((member) => [member.kind, member.name, member.reachable]).slice(1),
    [["agent", "scout", true]],
    "and who is on the roster, the person who runs the gateway first",
  );
  await scout.kept.stop();
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to go" });
  assert.deepEqual(
    registry.listing()?.members.map((member) => [member.name, member.reachable]).slice(1),
    [["scout", false]],
    "scout stays on the roster, no longer reachable",
  );
});

test("when the gateway goes away the last listing stays, and the registry comes back with the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  const registry = startRegistry(t);
  registerAgent(t, "scout");
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed" });

  await gateway.outage();

  await until(() => registry.status().state === "down", "the loss to be noticed");
  assert.deepEqual(
    registry.listing()?.programs.map((listed) => listed.name),
    ["scout"],
    "what was last known stays",
  );
  await gateway.recover();
  await until(() => registry.status().state === "up", "the gateway to be reached again");
  // Scout signs in and registers again on its own when the gateway is back.
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "scout to be listed again" });
});

test("a ticket for the chat server comes from the gateway, for the person who runs it, and the registry says why it cannot when it is away", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  const registry = startRegistry(t);
  await assert.rejects(registry.ticket({ kind: "chat", name: "chat" }), { name: "Down" });
  await until(() => registry.status().state === "up", "the gateway to be reached");
  registerChat(t);
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "the chat server to be listed" });

  const ticket = await registry.ticket({ kind: "chat", name: "chat" });

  assert.ok(ticket.value.length > 10);
  await gateway.outage();
  await until(() => registry.status().state === "down", "the loss to be noticed");
  await assert.rejects(registry.ticket({ kind: "chat", name: "chat" }), { name: "Down" });
});

test("the newest of programs with the same name is the one found", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const registry = startRegistry(t);
  registerChat(t, "1.0.0");
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 1, { what: "the first chat server" });
  // The gateway refuses a second body for an agent, and not for the chat server: a restarted one is listed beside its old connection.
  registerChat(t, "2.0.0");
  await eventually(() => registry.listing(), (listing) => listing?.programs.length === 2, { what: "the second chat server" });

  assert.equal((await registry.untilListed((listed) => listed.kind === "chat", new AbortController().signal)).version, "2.0.0");
});

test("closing stops it at once, even while the gateway is not there", { timeout }, async (t) => {
  useRuntimeDir(t);
  const registry = startRegistry(t);
  await until(() => registry.status().state === "down", "the first attempt to fail");

  await within(2000, registry.close(), "closing");
});
