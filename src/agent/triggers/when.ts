import { delayMs, normalizeDelay } from "../../contracts/agent/index.ts";
import { howLong, localTime } from "../../lib/time/index.ts";

/** Shortest and longest delay for a one-shot trigger, in milliseconds. */
export const SHORTEST_ONCE = 1_000;
export const LONGEST_ONCE = delayMs("366d");

/** When a one-shot trigger is due, or why what was asked for can't be used. */
export type When = { due: number } | { problem: string };

/** Parse `in` (delay) or `at` (ISO 8601 with offset) relative to `now`. */
export function readWhen(asked: { in?: string | undefined; at?: string | undefined }, now: number): When {
  const delay = given(asked.in);
  const at = given(asked.at);
  if (delay !== undefined && at !== undefined) {
    return { problem: "Give in or at, not both. in is a delay like 5m; at is an ISO 8601 time with an offset like 2026-10-05T09:00:00-04:00." };
  }

  let due: number;
  if (delay !== undefined) {
    const wait = normalizeDelay(delay);
    if (wait === undefined) {
      return { problem: `in: "${delay}" is not a delay I can read. Write a whole number and a unit: 30s, 5m, 2h or 1d.` };
    }
    due = now + delayMs(wait);
  } else if (at !== undefined) {
    const time = timeOf(at);
    if (time === undefined) {
      return { problem: `at: "${at}" is not a time I can read. Write ISO 8601 with an offset, such as 2026-10-05T09:00:00-04:00.` };
    }
    if (time <= now) {
      return { problem: `at: "${at}" is in the past. It is ${localTime(now)} now. Give a later time, or use in.` };
    }
    due = time;
  } else {
    return { problem: "Say when: give in (such as 30s, 5m, 2h or 1d) or at (ISO 8601 with an offset)." };
  }

  if (due - now < SHORTEST_ONCE) return { problem: `The shortest wait is ${howLong(SHORTEST_ONCE)}. Give a longer one.` };
  if (due - now > LONGEST_ONCE) return { problem: `The longest wait is ${howLong(LONGEST_ONCE)}. Give a shorter one.` };
  return { due };
}

function given(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

const ISO_TIME =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d+)?)?(?:Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/;

function timeOf(text: string): number | undefined {
  const parts = ISO_TIME.exec(text)?.groups;
  if (parts === undefined) return undefined;
  const part = (name: string): number => Number(parts[name] ?? 0);
  const month = part("month");
  const lastDay = new Date(Date.UTC(part("year"), month, 0)).getUTCDate();
  const real =
    month >= 1 &&
    month <= 12 &&
    part("day") >= 1 &&
    part("day") <= lastDay &&
    part("hour") <= 23 &&
    part("minute") <= 59 &&
    part("second") <= 59 &&
    part("offsetHour") <= 23 &&
    part("offsetMinute") <= 59;
  if (!real) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : time;
}
