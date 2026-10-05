import * as words from "./words.ts";

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** The shortest and the longest time from asking that a wake-up may be for, in milliseconds. */
export const SHORTEST = 1_000;
export const LONGEST = 366 * UNIT_MS.d;

/** When a wake-up is due, or why what was asked for can't be used, in words for the model. */
export type When = { due: number } | { problem: string };

/**
 * When the model asked to be woken, given `in`, a delay, or `at`, a time, and
 * when it asked. Exactly one is given; one left empty counts as left out.
 */
export function readWhen(asked: { in?: string | undefined; at?: string | undefined }, now: number): When {
  const delay = given(asked.in);
  const at = given(asked.at);
  if (delay !== undefined && at !== undefined) return { problem: words.GIVE_ONE };

  let due: number;
  if (delay !== undefined) {
    const wait = delayOf(delay);
    if (wait === undefined) return { problem: words.badDelay(delay) };
    due = now + wait;
  } else if (at !== undefined) {
    const time = timeOf(at);
    if (time === undefined) return { problem: words.badTime(at) };
    if (time <= now) return { problem: words.inThePast(at, now) };
    due = time;
  } else {
    return { problem: words.GIVE_WHEN };
  }

  if (due - now < SHORTEST) return { problem: words.tooSoon(SHORTEST) };
  if (due - now > LONGEST) return { problem: words.tooFar(LONGEST) };
  return { due };
}

/** What the model wrote, or nothing if it left the argument out or wrote only blanks. */
function given(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/** A delay such as 30s, 5m, 2h or 1d, in milliseconds. */
function delayOf(text: string): number | undefined {
  const match = /^(\d+)\s*([smhd])$/.exec(text);
  if (match === null) return undefined;
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

const ISO_TIME =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d+)?)?(?:Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/;

/**
 * An ISO 8601 time with an offset, in milliseconds since the epoch. A day the
 * calendar doesn't have, such as the 31st of February, is not read as the day
 * after it.
 */
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
