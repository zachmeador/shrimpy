import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeUri } from "./index.ts";

test("percent-escapes are undone, and text without any is left as it is", () => {
  assert.equal(decodeUri("a%2Fb%20c"), "a/b c");
  assert.equal(decodeUri("100%25%20%C3%BCn%C3%AFcode%20%E2%98%83"), "100% ünïcode ☃");
  assert.equal(decodeUri("plain-text"), "plain-text");
  assert.equal(decodeUri(""), "");
});

test("escapes that are not valid give undefined instead of an error", () => {
  assert.equal(decodeUri("%"), undefined);
  assert.equal(decodeUri("%E0%A4%A"), undefined);
  assert.equal(decodeUri("%FF"), undefined);
});
