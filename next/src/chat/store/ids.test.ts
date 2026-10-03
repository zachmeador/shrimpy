import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "./ids.ts";

test("an ID says what it names, stays short, and does not repeat", () => {
  const ids = new Set(Array.from({ length: 5000 }, () => newId("th")));

  assert.equal(ids.size, 5000);
  for (const id of ids) assert.match(id, /^th_[0-9a-hjkmnp-tv-z]{12}$/);
  assert.match(newId("ch"), /^ch_[0-9a-z]{12}$/);
  assert.match(newId("msg"), /^msg_[0-9a-z]{12}$/);
});
