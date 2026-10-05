import assert from "node:assert/strict";
import { test } from "node:test";
import { nextOccurrence } from "./schedule.ts";
import { parseTrigger, TriggerFileError } from "./triggers.ts";

const THREAD = "th_4k9x2m7q0b3d";

/** A trigger's file: the lines between the dashes, then a prompt. */
const file = (lines: string[], prompt = "Tidy up."): string => ["---", ...lines, "---", prompt, ""].join("\n");

test("a trigger's file is read as written, and one that doesn't check out is refused with the key that is wrong and what is allowed", () => {
  assert.deepEqual(parseTrigger("nightly", file(["every: 90 m", `thread: ${THREAD}`, "overlap: allow", "enabled: false"], "\n  Tidy up.  \n")), {
    name: "nightly",
    schedule: { every: "90m" },
    thread: THREAD,
    enabled: false,
    overlap: "allow",
    prompt: "Tidy up.",
  });
  assert.deepEqual(parseTrigger("daily", file(['cron: "0  3 * * *"', "timezone: Europe/Berlin"])).schedule, {
    cron: "0 3 * * *",
    timezone: "Europe/Berlin",
  });

  const refused: [string, string[], string][] = [
    ["a key nobody knows", ["every: 1h", "retries: 3"], "retries"],
    ["a delay under the minute", ["every: 30s"], "every"],
    ["a delay that is not one", ["every: soon"], "every"],
    ["both ways to schedule", ["every: 1h", "cron: 0 3 * * *"], "both"],
    ["no way to schedule", [`thread: ${THREAD}`], "cron"],
    ["a cron with the wrong number of fields", ["cron: 0 3 * *"], "cron"],
    ["a cron that never comes", ["cron: 0 0 30 2 *", "timezone: UTC"], "cron"],
    ["a time zone that isn't one", ["cron: 0 3 * * *", "timezone: Mars/Olympus"], "timezone"],
    ["a time zone with a delay", ["every: 1h", "timezone: UTC"], "timezone"],
    ["a thread that isn't an ID", ["every: 1h", "thread: general"], "thread"],
    ["an enabled that isn't true or false", ["every: 1h", "enabled: maybe"], "enabled"],
    ["an overlap that isn't allowed", ["every: 1h", "overlap: always"], "overlap"],
  ];
  for (const [what, lines, mentions] of refused) {
    assert.throws(
      () => parseTrigger("nightly", file(lines)),
      (error: Error) => error instanceof TriggerFileError && error.message.includes(mentions),
      what,
    );
  }
  assert.throws(() => parseTrigger("nightly", file(["every: 1h"], "  \n")), /prompt/);
  assert.throws(() => parseTrigger("nightly", "Tidy up.\n"), /front matter/);
  assert.throws(() => parseTrigger("two words", file(["every: 1h"])), /name/);
  // A key nobody knows is told with the keys there are, and the shortest delay can be shortened for a test.
  assert.throws(() => parseTrigger("nightly", file(["every: 1h", "retries: 3"])), /every, cron, timezone, thread, enabled and overlap/);
  assert.deepEqual(parseTrigger("quick", file(["every: 1s"]), { shortestEveryMs: 1_000 }).schedule, { every: "1s" });
});

test("a cron schedule is the next matching time in its own time zone, and a delay counts from where it is asked from", () => {
  const cron = (expression: string, timezone: string) => ({ cron: expression, timezone });
  const iso = (time: number): string => new Date(time).toISOString();
  const noon = Date.UTC(2026, 9, 4, 12);

  // 03:00 in Berlin is 01:00 UTC while it keeps summer time, and 03:00 in New York is 07:00 UTC.
  assert.equal(iso(nextOccurrence(cron("0 3 * * *", "Europe/Berlin"), noon)), "2026-10-05T01:00:00.000Z");
  assert.equal(iso(nextOccurrence(cron("0 3 * * *", "America/New_York"), noon)), "2026-10-05T07:00:00.000Z");
  // The clocks in Berlin go back on the 25th, so the same local time is an hour later in UTC after that.
  assert.equal(iso(nextOccurrence(cron("0 3 * * *", "Europe/Berlin"), Date.UTC(2026, 9, 25, 12))), "2026-10-26T02:00:00.000Z");
  // A local time the clocks skip comes once, at the time they jump to.
  assert.equal(iso(nextOccurrence(cron("30 2 * * *", "Europe/Berlin"), Date.UTC(2026, 2, 28, 12))), "2026-03-29T01:30:00.000Z");
  // It is strictly after the time asked from.
  assert.equal(iso(nextOccurrence(cron("0 3 * * *", "UTC"), Date.UTC(2026, 9, 5, 3))), "2026-10-06T03:00:00.000Z");
  assert.equal(nextOccurrence({ every: "15m" }, noon), noon + 900_000);
});
