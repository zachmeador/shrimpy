import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnOrigin } from "./origin.ts";

test("pages served from loopback on this port have the gateway's own origin", () => {
  assert.ok(isOwnOrigin("http://127.0.0.1:4100", 4100));
  assert.ok(isOwnOrigin("http://localhost:4100", 4100));
});

test("any other origin is foreign", () => {
  const foreign = [
    "http://127.0.0.1:4101",
    "http://localhost:4101",
    "http://127.0.0.1",
    "https://127.0.0.1:4100",
    "http://127.0.0.1:41000",
    "http://127.0.0.1:4100/",
    "http://127.0.0.1:4100.evil.example",
    "http://evil.example:4100",
    "http://evil.localhost:4100",
    "http://LOCALHOST:4100",
    "http://[::1]:4100",
    "http://0.0.0.0:4100",
    "null",
    "",
    "*",
  ];
  for (const origin of foreign) assert.equal(isOwnOrigin(origin, 4100), false, origin);
});
