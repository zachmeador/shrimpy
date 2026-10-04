import assert from "node:assert/strict";
import { test } from "node:test";
import type { Backoff } from "./backoff.ts";
import { keepRunning } from "./keep-running.ts";

function fixedPause(ms: number, calls: string[] = []): Backoff {
  return {
    next() {
      calls.push("next");
      return ms;
    },
    reset() {
      calls.push("reset");
    },
  };
}

test("an attempt that fails is tried again, and its error is reported", async () => {
  const stop = new AbortController();
  const errors: string[] = [];
  let attempts = 0;

  await keepRunning({
    signal: stop.signal,
    backoff: fixedPause(0),
    onError: (error) => errors.push(String(error)),
    async attempt() {
      attempts += 1;
      if (attempts < 3) throw new Error(`failed ${String(attempts)}`);
      stop.abort();
    },
  });

  assert.equal(attempts, 3);
  assert.deepEqual(errors, ["Error: failed 1", "Error: failed 2"]);
});

test("an established attempt resets the pauses", async () => {
  const stop = new AbortController();
  const calls: string[] = [];
  let attempts = 0;

  await keepRunning({
    signal: stop.signal,
    backoff: fixedPause(0, calls),
    async attempt(established) {
      attempts += 1;
      if (attempts === 1) throw new Error("not yet");
      if (attempts === 2) established();
      if (attempts === 3) stop.abort();
    },
  });

  assert.deepEqual(calls, ["next", "reset", "next"]);
});

test("stopping during a pause ends it at once", { timeout: 5000 }, async () => {
  const stop = new AbortController();
  let attempts = 0;

  const running = keepRunning({
    signal: stop.signal,
    backoff: fixedPause(60_000),
    async attempt() {
      attempts += 1;
      throw new Error("down");
    },
  });
  setTimeout(() => stop.abort(), 10);
  await running;

  assert.equal(attempts, 1);
});

test("the running attempt gets the stop signal, and stopping is not an error", { timeout: 5000 }, async () => {
  const stop = new AbortController();
  const errors: unknown[] = [];

  const running = keepRunning({
    signal: stop.signal,
    backoff: fixedPause(0),
    onError: (error) => errors.push(error),
    attempt(_established, signal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("closed")), { once: true });
      });
    },
  });
  setTimeout(() => stop.abort(), 10);
  await running;

  assert.deepEqual(errors, []);
});
