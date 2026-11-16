// cron-parser's entry point loads Node's `fs`, so whatever reads a cron schedule needs Node.
import { CronExpressionParser } from "cron-parser";
import { delayMs } from "./schedule.ts";
import type { TriggerSchedule } from "./shapes.ts";

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

/**
 * The time of the next occurrence, strictly after `from`, in milliseconds
 * since the epoch. A delay counts from `from`; a cron schedule is the next
 * matching minute in its time zone, which for a local time that does not exist
 * is the one the clock jumps to. Throws when a cron schedule never matches.
 */
export function nextOccurrence(schedule: TriggerSchedule, from: number): number {
  if ("every" in schedule) return from + delayMs(schedule.every);
  const expression = CronExpressionParser.parse(schedule.cron, { currentDate: new Date(from), tz: schedule.timezone });
  return expression.next().getTime();
}
