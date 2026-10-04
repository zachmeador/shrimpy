import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { startStandInGateway } from "../../contracts/gateway/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { joinGateway } from "./index.ts";

const timeout = 15_000;
const endpoint = { serverId: "11111111-1111-4111-8111-111111111111", socket: "/tmp/scout.sock", pid: 4242 };

test("an agent registers with the gateway as an agent of its name, at its endpoint, with its version", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);

  const kept = joinGateway("scout", endpoint, { backoff: backoff({ firstMs: 5, maxMs: 20 }) });
  stopAfter(t, () => kept.stop());

  await until(() => gateway.registered().length === 1, "the registration to arrive");
  assert.deepEqual(gateway.registered(), [{ kind: "agent", name: "scout", ...endpoint, version: SHRIMPY_VERSION }]);
  await kept.stop();
  await until(() => gateway.registered().length === 0, "the registration to end with the connection");
});

test("joining does not wait for a gateway, and registers when one starts", { timeout }, async (t) => {
  useRuntimeDir(t);
  const kept = joinGateway("scout", endpoint, { backoff: backoff({ firstMs: 5, maxMs: 20 }) });
  stopAfter(t, () => kept.stop());
  await delay(50);

  const gateway = await startStandInGateway(t);

  await until(() => gateway.registered().length === 1, "the registration to arrive");
});
