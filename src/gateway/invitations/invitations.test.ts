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

test("a code for a machine of a person's own says who it is for, is good once and for its time, and is no code for an agent, nor an agent's code one for a machine", () => {
  let now = 1_000;
  const invitations = createInvitations({ now: () => now, ttlMs: 500 });
  const machine = invitations.issueForMachine("mem_aaaaaaaaaaaa");
  const agent = invitations.issue("crab");

  assert.deepEqual(invitations.checkForMachine(agent.code), { ok: false, why: "unknown" }, "an agent's code is not for a machine");
  assert.deepEqual(invitations.check(machine.code, "crab"), { ok: false, why: "unknown" }, "nor a machine's for an agent");
  assert.deepEqual(invitations.checkForMachine("AAAA-AAAA"), { ok: false, why: "unknown" });
  assert.deepEqual(invitations.checkForMachine(undefined), { ok: false, why: "unknown" });

  const checked = invitations.checkForMachine(machine.code.replace("-", "").toLowerCase());
  assert.ok(checked.ok);
  assert.equal(checked.person, "mem_aaaaaaaaaaaa");
  assert.equal(invitations.checkForMachine(machine.code).ok, true, "looking is not using");
  checked.spend();
  assert.deepEqual(invitations.checkForMachine(machine.code), { ok: false, why: "used" });

  now += 500;
  assert.deepEqual(invitations.checkForMachine(machine.code), { ok: false, why: "unknown" }, "and it stops being good when its time is up");
});
