import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Roster } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { until } from "../lib/testing/index.ts";
import { connectTestClient, Echo, linkTestAgent } from "../contracts/gateway/testing/index.ts";
import { startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a hold of an agent's object waits until the agent links, and reaches it as the client", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const initial = await linkTestAgent(t, "scout", { place, token });
  const scoutId = initial.you.id;
  await initial.stop();
  const you = await connectTestClient(t, place);

  const echo = you.host.hold(Echo, { agent: scoutId }, context);
  await until(() => echo.state.value.kind === "failed", "the hold to wait for scout");
  const waiting = echo.state.value;
  assert.ok(waiting.kind === "failed" && waiting.cause.kind === "waiting", "it waits, not failed for good");
  assert.ok(waiting.cause.error.message.includes("scout"), "with words naming the agent");

  const scout = await linkTestAgent(t, "scout", { place, token });
  await until(() => echo.state.value.kind === "live", "the hold to bind once scout links");
  assert.deepEqual(echo.variant === "only" ? echo.caller.value : undefined, {
    kind: "person",
    member: you.you?.id,
    way: { kind: "socket" },
  });

  // The agent's own requests go up its link, stamped by the gateway as the agent.
  const roster = await scout.host.get(Roster, {}, context);
  assert.equal(roster.you.value?.name, "scout");
  assert.equal(roster.you.value.kind, "agent");
});

test("an agent that lost its gateway links again when it is back, and the holds bind again", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token });
  const before = await connectTestClient(t, place);
  const echo = before.host.hold(Echo, { agent: scout.you.id }, context);
  await until(() => echo.state.value.kind === "live", "the hold to bind");

  await gateway.close();
  await before.closed;
  const again = await startGatewayInProcess(t, { dataDir: gateway.dataDir });
  assert.equal(again.socket, gateway.socket);
  const after = await connectTestClient(t, place);
  const held = after.host.hold(Echo, { agent: scout.you.id }, context);
  await until(() => held.state.value.kind === "live", "scout to link again and the hold to bind");
});
