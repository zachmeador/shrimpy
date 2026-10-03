import assert from "node:assert/strict";
import { test } from "node:test";
import { backoff } from "./backoff.ts";

test("pauses double up to the maximum, and reset starts over", () => {
  const pauses = backoff({ firstMs: 100, maxMs: 500, random: () => 0 });

  assert.deepEqual(
    [pauses.next(), pauses.next(), pauses.next(), pauses.next(), pauses.next()],
    [100, 200, 400, 500, 500],
  );
  pauses.reset();
  assert.equal(pauses.next(), 100);
});

test("a pause is shortened by at most a quarter", () => {
  const pauses = backoff({ firstMs: 1000, maxMs: 1000, random: () => 0.999 });

  const pause = pauses.next();
  assert.ok(pause >= 750 && pause < 1000, String(pause));
});

test("the defaults start short and stay bounded", () => {
  const pauses = backoff();

  assert.ok(pauses.next() <= 250);
  for (let i = 0; i < 20; i += 1) assert.ok(pauses.next() <= 15_000);
});
