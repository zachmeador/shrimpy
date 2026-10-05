import assert from "node:assert/strict";
import { test } from "node:test";
import { localTime } from "./index.ts";

/** Run `check` as a machine in `zone` would, and put the zone back, whatever the suite runs in. */
function inZone(zone: string, check: () => void): void {
  const saved = process.env.TZ;
  process.env.TZ = zone;
  try {
    check();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

test("a time is local to the second with the offset in force then, whatever zone the machine is in", () => {
  const moment = Date.UTC(2026, 9, 5, 13, 0, 29, 999);
  inZone("America/New_York", () => assert.equal(localTime(moment), "2026-10-05T09:00:29-04:00"));
  inZone("Europe/Berlin", () => assert.equal(localTime(moment), "2026-10-05T15:00:29+02:00"));
  inZone("Asia/Kolkata", () => assert.equal(localTime(moment), "2026-10-05T18:30:29+05:30"));
  inZone("UTC", () => assert.equal(localTime(moment), "2026-10-05T13:00:29+00:00"));
  // The date follows the zone, and the offset is the one then: clocks that go back repeat an hour, with the other offset.
  inZone("Pacific/Auckland", () => assert.equal(localTime(Date.UTC(2026, 11, 31, 12)), "2027-01-01T01:00:00+13:00"));
  inZone("America/New_York", () => {
    assert.equal(localTime(Date.UTC(2026, 10, 1, 5, 30)), "2026-11-01T01:30:00-04:00");
    assert.equal(localTime(Date.UTC(2026, 10, 1, 6, 30)), "2026-11-01T01:30:00-05:00");
  });

  // In the zone the suite runs in, which is anyone's, it reads back as the same moment, to the second.
  assert.match(localTime(moment), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(localTime(moment)), moment - 999);
  assert.throws(() => localTime(Number.NaN), RangeError);
});
