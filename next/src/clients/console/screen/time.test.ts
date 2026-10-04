import assert from "node:assert/strict";
import { test } from "node:test";
import { whenOf } from "./time.ts";

// Local time throughout, since that is how a person reads it: these dates are built from local parts.
const at = (year: number, month: number, day: number, hour: number, minute: number): number =>
  new Date(year, month - 1, day, hour, minute).getTime();
const now = at(2026, 10, 3, 15, 0);

test("today is the time of day", () => {
  assert.equal(whenOf(at(2026, 10, 3, 9, 5), now), "09:05");
  assert.equal(whenOf(at(2026, 10, 3, 23, 59), now), "23:59");
  assert.equal(whenOf(now, now), "15:00");
});

test("another day this year is the month, the day and the time", () => {
  assert.equal(whenOf(at(2026, 10, 2, 23, 59), now), "Oct 2 23:59");
  assert.equal(whenOf(at(2026, 1, 1, 0, 0), now), "Jan 1 00:00");
});

test("a day in another year is the whole date", () => {
  assert.equal(whenOf(at(2025, 12, 31, 23, 59), now), "2025-12-31 23:59");
});
