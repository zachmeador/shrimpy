/*
 * Every sentence the model reads from `check_back`: what it is for, what its
 * arguments mean, and what it answers. Nothing else in this module writes words
 * for the model.
 */
import { localTime } from "../../lib/time/index.ts";

export const CHECK_DESCRIPTION =
  "Wake yourself once, later, to look at something again, such as a build or a deploy. Say how long to wait with " +
  "in, or what time with at, and write a note to yourself about what to check. Use it instead of waiting in a " +
  "command with sleep: call it, then end your turn. When the time comes you are woken in this same conversation, " +
  "with your note.";
export const CHECK_IN =
  "How long to wait: a whole number and a unit, s, m, h or d, such as 30s, 5m, 2h or 1d. Give this or at, not both.";
export const CHECK_AT =
  "The time to wake you, written as the times you are shown are: ISO 8601 with an offset, such as " +
  "2026-10-05T09:00:00-04:00. Give this or in, not both.";
export const CHECK_NOTE =
  "What you want to be told when you wake, in your own words: what to check, and what to do about it.";

export const GIVE_ONE =
  "Not set: give in or at, not both. in is how long to wait, such as 5m. at is a time, such as 2026-10-05T09:00:00-04:00.";
export const GIVE_WHEN =
  "Not set: say when. Give in, how long to wait, such as 30s, 5m, 2h or 1d, or at, a time, such as 2026-10-05T09:00:00-04:00.";
export const NOTE_EMPTY = "Not set: write a note, what you want to be told when you wake.";

export const tooSoon = (shortest: number): string =>
  `Not set: the shortest wait is ${howLong(shortest)}. Give a longer one.`;

export const tooFar = (longest: number): string =>
  `Not set: the longest wait is ${howLong(longest)}. Give a shorter one.`;

export const badDelay = (text: string): string =>
  `Not set: in: "${text}" is not a delay I can read. Write a whole number and a unit: 30s, 5m, 2h or 1d.`;

export const badTime = (text: string): string =>
  `Not set: at: "${text}" is not a time I can read. Write ISO 8601 with an offset, as the times you are shown are, ` +
  "such as 2026-10-05T09:00:00-04:00.";

export const inThePast = (text: string, now: number): string =>
  `Not set: at: "${text}" is in the past. It is ${localTime(now)} now. Give a later time, or use in.`;

export const noteTooLong = (length: number, most: number): string =>
  `Not set: the note is ${length} characters, and the most is ${most}. Say only what you will need.`;

export const tooMany = (waiting: number): string =>
  `Not set: ${waiting} wake-ups are already waiting for you, which is the most there can be. ` +
  "Wait for one to wake you first.";

export const wakeSet = (due: number, askedAt: number, inThread: boolean): string =>
  `You will be woken ${inThread ? "in this thread " : ""}at ${localTime(due)}, in ${howLong(due - askedAt)}, with your note. You can end your turn now.`;

/** A length of time in its two largest units: "2 hours 30 minutes", "5 minutes", "1 day". */
export function howLong(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  const counts = [
    Math.floor(seconds / 86_400),
    Math.floor((seconds % 86_400) / 3_600),
    Math.floor((seconds % 3_600) / 60),
    seconds % 60,
  ];
  const names = ["day", "hour", "minute", "second"];
  const first = Math.max(
    0,
    counts.findIndex((count) => count > 0),
  );
  return counts
    .slice(first, first + 2)
    .flatMap((count, index) => (count > 0 ? [`${count} ${names[first + index] ?? ""}${count === 1 ? "" : "s"}`] : []))
    .join(" ");
}
