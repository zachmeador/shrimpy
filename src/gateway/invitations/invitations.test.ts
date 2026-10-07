import assert from "node:assert/strict";
import { test } from "node:test";
import { createInvitations } from "./index.ts";

test("a code is good once, for its name only and for its time, and is read without regard to case or the hyphen", () => {
  let now = 1_000;
  const invitations = createInvitations({ now: () => now, ttlMs: 500 });
  const { code, expires } = invitations.issue("crab");
  const other = invitations.issue("rex");

  assert.match(code, /^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/, "eight letters and digits that are not look-alikes, with a hyphen in the middle");
  assert.equal(expires, 1_500);
  assert.notEqual(code, other.code);

  assert.deepEqual(invitations.check(code, "rex"), { ok: false, why: "unknown" }, "not for another name");
  assert.deepEqual(invitations.check("AAAA-AAAA", "crab"), { ok: false, why: "unknown" }, "nor one that was never made");
  assert.deepEqual(invitations.check(undefined, "crab"), { ok: false, why: "unknown" });
  const checked = invitations.check(code.replace("-", "").toLowerCase(), "crab");
  assert.ok(checked.ok);

  // Looking is not using: it is spent when whoever looked says so, once.
  assert.equal(invitations.check(code, "crab").ok, true);
  checked.spend();
  assert.deepEqual(invitations.check(code, "crab"), { ok: false, why: "used" });

  now += 499;
  assert.equal(invitations.check(other.code, "rex").ok, true);
  now += 1;
  assert.deepEqual(invitations.check(other.code, "rex"), { ok: false, why: "unknown" }, "and it stops being good when its time is up");
});
