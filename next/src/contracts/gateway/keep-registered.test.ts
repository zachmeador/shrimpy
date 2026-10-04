import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Refusal } from "../../lib/refusal/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { offer, startStandIn, stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME, type Registration } from "./index.ts";
import { type KeepRegisteredOptions, keepRegistered } from "./node.ts";
import { startStandInGateway } from "./testing/index.ts";

const timeout = 15_000;

const registration: Registration = {
  kind: "chat",
  name: "chat",
  serverId: randomUUID(),
  socket: "/tmp/chat.sock",
  pid: process.pid,
  version: "0.0.0",
};

/** Keep `registration` registered with short pauses between attempts, until the test ends. */
function keep(t: TestContext, options: KeepRegisteredOptions = {}) {
  const kept = keepRegistered(registration, { backoff: backoff({ firstMs: 5, maxMs: 20 }), ...options });
  stopAfter(t, () => kept.stop());
  return kept;
}

test("it registers with the gateway and stays registered while the connection lasts", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);

  keep(t);

  await until(() => gateway.registered().length === 1, "the registration to arrive");
  assert.deepEqual(gateway.registered(), [registration]);
  await delay(50);
  assert.deepEqual(gateway.received, [registration]);
  assert.equal(gateway.connections(), 1);
});

test("stopping ends the registration by closing the connection", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const kept = keep(t);
  await until(() => gateway.registered().length === 1, "the registration to arrive");

  await kept.stop();
  await kept.stop();

  await until(() => gateway.connections() === 0, "the connection to close");
  assert.deepEqual(gateway.registered(), []);
});

test("it registers again when the gateway goes away and comes back", { timeout }, async (t) => {
  useRuntimeDir(t);
  const first = await startStandInGateway(t);
  keep(t);
  await until(() => first.registered().length === 1, "the registration to arrive");

  await first.close();
  const second = await startStandInGateway(t);

  await until(() => second.registered().length === 1, "the registration to arrive again");
  assert.deepEqual(second.registered(), [registration]);
});

test("it registers again after every restart of the gateway, not just the first", { timeout }, async (t) => {
  useRuntimeDir(t);
  let gateway = await startStandInGateway(t);
  keep(t);

  for (let restart = 1; restart <= 5; restart++) {
    const current = gateway;
    await until(() => current.registered().length === 1, `registration number ${restart}`);
    await current.close();
    gateway = await startStandInGateway(t);
  }

  const last = gateway;
  await until(() => last.registered().length === 1, "the last registration");
  assert.deepEqual(last.registered(), [registration]);
});

test("it waits for a gateway that is not there yet, and says nothing about it", { timeout }, async (t) => {
  useRuntimeDir(t);
  const errors: Error[] = [];
  keep(t, { onError: (error) => errors.push(error) });
  await delay(100);

  const gateway = await startStandInGateway(t);

  await until(() => gateway.registered().length === 1, "the registration to arrive");
  assert.deepEqual(errors, []);
});

test("something on the gateway's socket that is not the gateway is reported, and tried again", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandIn(t, GATEWAY_SOCKET_NAME, {
    offer: () =>
      offer(Gateway, {
        register: () => Promise.resolve(),
        list: () => Promise.resolve([]),
        version: () => Promise.resolve(registration.version),
      }),
  });
  const errors: Error[] = [];

  keep(t, { onError: (error) => errors.push(error) });

  await until(() => errors.length >= 2, "two attempts to fail");
  assert.match(errors[0]?.message ?? "", /does not match/);
});

test("a registration the gateway refuses is reported with its reason, and tried again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(Gateway, {
        register: () => Promise.reject(new Refusal("Invalid registration: pid must be a positive integer")),
        list: () => Promise.resolve([]),
        version: () => Promise.resolve(registration.version),
      }),
  });
  const errors: Error[] = [];
  const kept = keep(t, { onError: (error) => errors.push(error) });

  await until(() => errors.length >= 2, "two attempts to fail");
  await kept.stop();

  assert.equal(errors[0]?.message, "Invalid registration: pid must be a positive integer");
  await until(() => gateway.connections() === 0, "the connections to close");
});

test("stopping while it waits to try again does not wait for the pause", { timeout: 5000 }, async (t) => {
  useRuntimeDir(t);
  const kept = keepRegistered(registration, { backoff: backoff({ firstMs: 60_000, maxMs: 60_000 }) });
  await delay(50);

  await kept.stop();
});

test("stopping straight away registers nothing", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const kept = keepRegistered(registration);

  await kept.stop();

  assert.deepEqual(gateway.received, []);
  await until(() => gateway.connections() === 0, "the connection to close");
});
