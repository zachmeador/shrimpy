import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { Refusal } from "../../lib/refusal/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { namedSocketPath } from "../../lib/runtime/node.ts";
import {
  eventually,
  freezable,
  offer,
  startStandIn,
  stopAfter,
  until,
  useRuntimeDir,
  within,
} from "../../lib/testing/index.ts";
import { type Announcement, Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME } from "./index.ts";
import { type KeepRegisteredOptions, keepRegistered } from "./node.ts";
import { gatewayThatDoes, startTestGateway, type TestGateway } from "./testing/index.ts";

const timeout = 30_000;

const announcement: Announcement = {
  kind: "chat",
  serverId: randomUUID(),
  socket: "/tmp/chat.sock",
  pid: process.pid,
  version: "0.0.0",
};

/** Keep `announcement` registered with short pauses between attempts, until the test ends. */
function keep(t: TestContext, options: KeepRegisteredOptions = {}) {
  const kept = keepRegistered(announcement, { backoff: backoff({ firstMs: 5, maxMs: 20 }), ...options });
  stopAfter(t, () => kept.stop());
  return kept;
}

/** What the gateway lists, asked over a connection of its own. */
async function listed(gateway: TestGateway): Promise<string[]> {
  const observer = await gateway.connect();
  try {
    return (await observer.list()).map((each) => `${each.kind} ${each.name}`);
  } finally {
    await observer.close();
  }
}

test("it registers with the gateway and stays registered while the connection lasts", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);

  const kept = keep(t);

  await eventually(() => listed(gateway), (programs) => programs.length === 1, { what: "the registration to arrive" });
  assert.deepEqual(await listed(gateway), ["chat chat"]);
  assert.ok(kept.current() !== undefined, "and the connection it holds is there to ask the gateway things over");
  await delay(50);
  assert.deepEqual(await listed(gateway), ["chat chat"], "once, not again and again");
});

test("stopping ends the registration by closing the connection", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const kept = keep(t);
  await eventually(() => listed(gateway), (programs) => programs.length === 1, { what: "the registration to arrive" });

  await kept.stop();
  await kept.stop();

  await eventually(() => listed(gateway), (programs) => programs.length === 0, { what: "the registration to go" });
  assert.equal(kept.current(), undefined);
});

test("it registers again after every restart of the gateway, not just the first", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  keep(t);

  for (let restart = 1; restart <= 3; restart++) {
    await eventually(() => listed(gateway), (programs) => programs.length === 1, {
      what: `registration number ${restart}`,
      timeoutMs: 20_000,
    });
    await gateway.outage();
    await gateway.recover();
  }

  await eventually(() => listed(gateway), (programs) => programs.length === 1, {
    what: "the last registration",
    timeoutMs: 20_000,
  });
});

test("it waits for a gateway that is not there yet, and says nothing about it", { timeout }, async (t) => {
  useRuntimeDir(t);
  const errors: Error[] = [];
  const kept = keep(t, { onError: (error) => errors.push(error) });
  await delay(100);
  const waiting = kept.untilUp(AbortSignal.timeout(20_000));

  const gateway = await startTestGateway(t);

  await within(20_000, waiting, "the connection to come up");
  assert.deepEqual(await listed(gateway), ["chat chat"]);
  assert.deepEqual(errors, []);
});

test("a registration the gateway refuses is reported with its reason, and tried again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(
        Gateway,
        gatewayThatDoes({
          register: () => Promise.reject(new Refusal("Invalid registration: pid must be a positive integer")),
        }),
      ),
  });
  const errors: Error[] = [];
  const kept = keep(t, { onError: (error) => errors.push(error) });

  await until(() => errors.length >= 2, "two attempts to fail");
  await kept.stop();

  assert.equal(errors[0]?.message, "Invalid registration: pid must be a positive integer");
  await until(() => gateway.connections() === 0, "the connections to close");
});

/**
 * How long stopping may take before it counts as held up. A stop takes
 * milliseconds, and this is less than the moment a goodbye is given, so waiting
 * for a gateway that has stopped answering is caught too.
 */
const PROMPT_MS = 900;

test("a gateway that takes the connection and never answers does not hold up stopping", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const silent = freezable(createUnixTransportFactory({ path: namedSocketPath(GATEWAY_SOCKET_NAME) }));
  silent.freeze();
  const kept = keep(t, { transportFactory: silent.transportFactory });
  await delay(100);

  await within(PROMPT_MS, kept.stop(), "stopping");

  assert.deepEqual(await listed(gateway), []);
});

test("a gateway that stops answering after the registration does not hold up stopping", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const reachable = freezable(createUnixTransportFactory({ path: namedSocketPath(GATEWAY_SOCKET_NAME) }));
  const kept = keep(t, { transportFactory: reachable.transportFactory });
  await eventually(() => listed(gateway), (programs) => programs.length === 1, { what: "the registration to arrive" });

  reachable.freeze();
  await within(PROMPT_MS, kept.stop(), "stopping");

  await eventually(() => listed(gateway), (programs) => programs.length === 0, { what: "the registration to go" });
});
