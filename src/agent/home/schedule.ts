import { CronExpressionParser } from "cron-parser";
import type { TriggerSchedule } from "../../contracts/agent/index.ts";

/** The shortest a trigger may repeat at, in milliseconds. Tests shorten it. */
export const SHORTEST_EVERY_MS = 60_000;

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const DELAY = /^(\d+)\s*([smhd])$/;

/**
 * A delay such as 15m, 1h or 1d written the plain way, with no space and no
 * leading zero, or undefined when `text` is not a delay.
 */
export function normalizeEvery(text: string): string | undefined {
  const match = DELAY.exec(text.trim());
  return match === null ? undefined : `${String(Number(match[1]))}${match[2]}`;
}

/** What a delay written as `normalizeEvery` writes it comes to, in milliseconds. */
export function everyMs(every: string): number {
  const match = DELAY.exec(every);
  if (match === null) throw new Error(`"${every}" is not a delay.`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

/** A length of time as the plain delay that comes to it, if there is one: 3600000 is 1h, 90000 is 90s. */
export function delayText(milliseconds: number): string {
  for (const [unit, size] of [["d", UNIT_MS.d], ["h", UNIT_MS.h], ["m", UNIT_MS.m], ["s", UNIT_MS.s]] as const) {
    if (milliseconds % size === 0) return `${String(milliseconds / size)}${unit}`;
  }
  return `${String(milliseconds)}ms`;
}

/** The time zone of this machine, which a cron schedule uses when its file names none. */
export function machineTimezone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Whether cron can work in this time zone. */
export function isTimezone(name: string): boolean {
  try {
    CronExpressionParser.parse("* * * * *", { currentDate: new Date(0), tz: name }).next();
    return true;
  } catch {
    return false;
  }
}

/** The five fields of a cron expression with one space between them, or undefined when there are not five. */
export function cronFields(expression: string): string | undefined {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5 ? fields.join(" ") : undefined;
}

/**
 * The time of the next occurrence, strictly after `from`, in milliseconds
 * since the epoch. A delay counts from `from`; a cron schedule is the next
 * matching minute in its time zone, which for a local time that does not exist
 * is the one the clock jumps to. Throws when a cron schedule never matches.
 */
export function nextOccurrence(schedule: TriggerSchedule, from: number): number {
  if ("every" in schedule) return from + everyMs(schedule.every);
  const expression = CronExpressionParser.parse(schedule.cron, { currentDate: new Date(from), tz: schedule.timezone });
  return expression.next().getTime();
}

/** A schedule as the model and a person read it: "every 1h", or `cron "0 3 * * *" in Europe/Berlin`. */
export function describeSchedule(schedule: TriggerSchedule): string {
  return "every" in schedule ? `every ${schedule.every}` : `cron "${schedule.cron}" in ${schedule.timezone}`;
}

/** Whether two schedules make the same occurrences. */
export function sameSchedule(a: TriggerSchedule, b: TriggerSchedule): boolean {
  if ("every" in a || "every" in b) return "every" in a && "every" in b && a.every === b.every;
  return a.cron === b.cron && a.timezone === b.timezone;
}
