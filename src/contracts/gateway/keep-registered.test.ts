import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { Refusal } from "../../lib/refusal/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import {
  freezable,
  offer,
  startStandIn,
  stopAfter,
  until,
  useRuntimeDir,
  within,
} from "../../lib/testing/index.ts";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME, type Registration } from "./index.ts";
import { type KeepRegisteredOptions, keepRegistered } from "./node.ts";
import { gatewayThatDoes, startStandInGateway } from "./testing/index.ts";

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

test("a registration the gateway refuses is reported with its reason, and tried again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(
        Gateway,
        gatewayThatDoes({
          register: () => Promise.reject(new Refusal("Invalid registration: pid must be a positive integer")),
          list: () => Promise.resolve([]),
          version: () => Promise.resolve(registration.version),
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
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const silent = freezable(createUnixTransportFactory({ path: gateway.socket }));
  silent.freeze();
  const kept = keep(t, { transportFactory: silent.transportFactory });
  await until(() => gateway.connections() === 1, "the gateway to take the connection");

  await within(PROMPT_MS, kept.stop(), "stopping");

  await until(() => gateway.connections() === 0, "the connection to close");
  assert.deepEqual(gateway.received, []);
});

test("a gateway that stops answering after the registration does not hold up stopping", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const reachable = freezable(createUnixTransportFactory({ path: gateway.socket }));
  const kept = keep(t, { transportFactory: reachable.transportFactory });
  await until(() => gateway.registered().length === 1, "the registration to arrive");

  reachable.freeze();
  await within(PROMPT_MS, kept.stop(), "stopping");

  await until(() => gateway.connections() === 0, "the connection to close");
  assert.deepEqual(gateway.registered(), []);
});

test("it can be given the way to reach a gateway that is not this machine's", { timeout }, async (t) => {
  useRuntimeDir(t);
  const local = await startStandInGateway(t);
  const elsewhere = await startStandInGateway(t, { socketName: "gateway-elsewhere" });

  const kept = keep(t, { transportFactory: createUnixTransportFactory({ path: elsewhere.socket }) });

  await until(() => elsewhere.registered().length === 1, "the registration to arrive");
  assert.deepEqual(elsewhere.registered(), [registration]);
  await kept.stop();
  await until(() => elsewhere.connections() === 0, "the connection to close");
  assert.deepEqual(local.received, []);
  assert.equal(local.connections(), 0);
});
