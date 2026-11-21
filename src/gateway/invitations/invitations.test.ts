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
  const checked = invitations.check(code.replace("-", "").toLowerCase(), "CRAB");
  assert.ok(checked.ok);
  assert.equal(checked.name, "crab", "it returns the spelling the invitation was made with");
  assert.equal(checked.member, null);

  // Looking is not using: it is spent when whoever looked says so, once.
  assert.equal(invitations.check(code, "crab").ok, true);
  checked.spend();
  assert.deepEqual(invitations.check(code, "crab"), { ok: false, why: "used" });

  now += 499;
  assert.equal(invitations.check(other.code, "rex").ok, true);
  now += 1;
  assert.deepEqual(invitations.check(other.code, "rex"), { ok: false, why: "unknown" }, "and it stops being good when its time is up");
});

test("an invitation for an existing agent carries its member ID, and forgetting that member withdraws it", () => {
  const invitations = createInvitations();
  const existing = invitations.issue("crab", "mem_123456789abc");
  const fresh = invitations.issue("rex");

  const checked = invitations.check(existing.code, "crab");
  assert.ok(checked.ok);
  assert.equal(checked.member, "mem_123456789abc");

  invitations.forgetMember("mem_123456789abc");
  assert.deepEqual(invitations.check(existing.code, "crab"), { ok: false, why: "unknown" });
  assert.equal(invitations.check(fresh.code, "rex").ok, true, "other invitations stay");
});

test("a code for a device is good once and for its time, and only for a device", () => {
  let now = 1_000;
  const invitations = createInvitations({ now: () => now, ttlMs: 500 });
  const device = invitations.issueForDevice("mem_aaaaaaaaaaaa");
  const agent = invitations.issue("crab");

  assert.deepEqual(invitations.checkForDevice(agent.code), { ok: false, why: "unknown" }, "an agent's code is not for a device");
  assert.deepEqual(invitations.check(device.code, "crab"), { ok: false, why: "unknown" }, "nor a device's for an agent");
  assert.deepEqual(invitations.checkForDevice("AAAA-AAAA"), { ok: false, why: "unknown" });
  assert.deepEqual(invitations.checkForDevice(undefined), { ok: false, why: "unknown" });

  const checked = invitations.checkForDevice(device.code.replace("-", "").toLowerCase());
  assert.ok(checked.ok);
  assert.equal(checked.person, "mem_aaaaaaaaaaaa");
  assert.equal(invitations.checkForDevice(device.code).ok, true, "looking is not using");
  checked.spend();
  assert.deepEqual(invitations.checkForDevice(device.code), { ok: false, why: "used" });

  now += 500;
  assert.deepEqual(invitations.checkForDevice(device.code), { ok: false, why: "unknown" }, "and it stops being good when its time is up");
});
