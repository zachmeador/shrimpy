import assert from "node:assert/strict";
import { test } from "node:test";
import { politely } from "./goodbye.ts";

test("a goodbye that finishes in time is waited for", async () => {
  assert.equal(await politely(Promise.resolve("bye"), 1000), true);
});

test("a goodbye that fails counts as finished, since the connection is dropped either way", async () => {
  assert.equal(await politely(Promise.reject(new Error("the server is gone")), 1000), true);
});

test("a goodbye that never finishes is given up on after its moment", async () => {
  const started = Date.now();

  const finished = await politely(new Promise<void>(() => undefined), 40);

  assert.equal(finished, false);
  assert.ok(Date.now() - started >= 30);
});
