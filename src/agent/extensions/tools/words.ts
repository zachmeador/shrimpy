/*
 * Every sentence the model reads from the agent's own tools: what each tool is
 * for, what its arguments mean, and what it answers. Nothing else in this
 * module writes words for the model.
 */
import { utc } from "../../intake/index.ts";

/** The argument that names a place: where `send_message` posts, and what `read_messages` reads. */
export type PlaceArgument = "to" | "from";

export const SEND_DESCRIPTION =
  "Post a message now, without ending your turn. Use it to tell someone something before you finish, or to " +
  "write somewhere other than this thread. What you write last is still posted as your reply, so don't use " +
  "this to answer.";
export const SEND_TEXT = "The message to post.";
export const SEND_TO =
  "Where to post it: @name for your DM with that person or agent, which is started if you have none. " +
  "Leave it out to post to this thread.";

export const READ_DESCRIPTION =
  "Read the newest messages of a thread, oldest first, as they stand now: edited ones say so, deleted ones " +
  "have lost their text, and reactions are listed. Use it to see what was said earlier, in this thread " +
  "or in your DM with someone.";
export const READ_FROM =
  "Which thread to read: @name for your DM with that person or agent. Leave it out to read this thread.";
export const READ_LIMIT = "How many messages to read. 20 if you leave it out, and at most 100.";
export const READ_BEFORE =
  "A number from an earlier result: read only the messages before it. The result says which number to use.";

export const THIS_THREAD = "this thread";

export const dmWith = (name: string): string => `your DM with ${name}`;

// Where a message goes or comes from, when that cannot be worked out.

export function badPlace(argument: PlaceArgument): string {
  const tail = argument === "to" ? "post to this thread" : "read this thread";
  return `${argument} should be @name, such as @maya: the name of a person or an agent. Leave it out to ${tail}.`;
}

const nowhere = (argument: PlaceArgument): string =>
  argument === "to" ? "there is nowhere to send this" : "there is nothing to read";

export function nobody(name: string, members: string[]): string {
  return `Nobody is called @${name}. The members are: ${members.join(", ")}.`;
}

export const noDmYet = (name: string): string =>
  `You have no DM with ${name} yet, so there is nothing to read. Writing to them starts one.`;

export function noRoster(name: string, argument: PlaceArgument): string {
  return `Can't look up @${name}: the gateway is unreachable right now, so ${nowhere(argument)}. Try again later.`;
}

export function yourself(name: string, argument: PlaceArgument): string {
  const tail = argument === "to" ? "post to this thread" : "read this thread";
  return `@${name} is you. Leave ${argument} out to ${tail}.`;
}

export function noThreadHere(argument: PlaceArgument): string {
  const verb = argument === "to" ? "post to" : "read";
  return `This session is not in a thread, so there is no thread to ${verb} by default. Say which with ${argument}: @name.`;
}

export const noMainThread = (label: string): string => `${label} has no main thread to use.`;

// How chat answered.

export const SEND_EMPTY = "Not sent: there is no text to post.";
export const SEND_UNREACHABLE = "Not sent: chat is unreachable right now, so nothing was posted. Try again later.";
export const READ_UNREACHABLE = "Not read: chat is unreachable right now. Try again later.";

export function sendCutOff(posted: number, total: number): string {
  return (
    `Chat became unreachable after ${posted} of ${total} parts were posted. The rest was not sent. ` +
    "Try again later, and send only the rest."
  );
}

export function sendUncertain(confirmed: number, total: number): string {
  if (confirmed === 0) {
    return (
      "Chat dropped the connection before it confirmed the message, so it may or may not have been posted. " +
      "Read the thread to check before you send it again."
    );
  }
  return (
    `Chat dropped the connection after ${confirmed} of ${total} parts were confirmed, and the next may or ` +
    "may not have been posted. Read the thread to check before you send the rest."
  );
}

export function sendRefused(reason: string, posted: number, total: number): string {
  if (posted === 0) return `Not sent: chat did not accept it (${reason}).`;
  return `Chat did not accept part ${posted + 1} of ${total} (${reason}) after ${posted} were posted. The rest was not sent.`;
}

export const readRefused = (reason: string): string => `Not read: chat did not accept it (${reason}).`;

// What worked.

export function posted(label: string, parts: number, here: boolean): string {
  const sentence = `Posted to ${label}${parts > 1 ? ` in ${parts} parts` : ""}.`;
  return here ? `${sentence} Your reply at the end of your turn is posted too, so if this said it all, finish with END.` : sentence;
}

export function readHeader(label: string): string {
  return `Messages in ${label}, oldest first:`;
}

export function nothingToRead(label: string, older: boolean): string {
  return older ? `There are no older messages in ${label}.` : `There are no messages in ${label} yet.`;
}

export function olderMessages(before: number, from: string | undefined): string {
  const where = from === undefined ? "" : ` and from: "${from}"`;
  return `There are older messages. To read them, call read_messages again with before: ${before}${where}.`;
}

// check_back: what it is for, and what it answers.

export const CHECK_DESCRIPTION =
  "Wake yourself once, later, to look at something again, such as a build or a deploy. Say how long to wait with " +
  "in, or what time with at, and write a note to yourself about what to check. Use it instead of waiting in a " +
  "command with sleep: call it, then end your turn. When the time comes you are woken in this thread, with your note.";
export const CHECK_IN =
  "How long to wait: a whole number and a unit, s, m, h or d, such as 30s, 5m, 2h or 1d. Give this or at, not both.";
export const CHECK_AT =
  "The time to wake you: ISO 8601 with an offset, such as 2026-10-05T09:00:00Z or 2026-10-05T09:00:00-07:00. " +
  "Give this or in, not both.";
export const CHECK_NOTE =
  "What you want to be told when you wake, in your own words: what to check, and what to do about it.";

export const GIVE_ONE =
  "Not set: give in or at, not both. in is how long to wait, such as 5m. at is a time, such as 2026-10-05T09:00:00Z.";
export const GIVE_WHEN =
  "Not set: say when. Give in, how long to wait, such as 30s, 5m, 2h or 1d, or at, a time, such as 2026-10-05T09:00:00Z.";
export const NOTE_EMPTY = "Not set: write a note, what you want to be told when you wake.";

export const tooSoon = (shortest: number): string =>
  `Not set: the shortest wait is ${howLong(shortest)}. Give a longer one.`;

export const tooFar = (longest: number): string =>
  `Not set: the longest wait is ${howLong(longest)}. Give a shorter one.`;

export const badDelay = (text: string): string =>
  `Not set: in: "${text}" is not a delay I can read. Write a whole number and a unit: 30s, 5m, 2h or 1d.`;

export const badTime = (text: string): string =>
  `Not set: at: "${text}" is not a time I can read. Write ISO 8601 with an offset, such as 2026-10-05T09:00:00Z or ` +
  "2026-10-05T09:00:00-07:00.";

export const inThePast = (text: string, now: number): string =>
  `Not set: at: "${text}" is in the past. It is ${utc(now)} now. Give a later time, or use in.`;

export const noteTooLong = (length: number, most: number): string =>
  `Not set: the note is ${length} characters, and the most is ${most}. Say only what you will need.`;

export const tooMany = (waiting: number): string =>
  `Not set: ${waiting} wake-ups are already waiting for you, which is the most there can be. ` +
  "Wait for one to wake you first.";

export const wakeSet = (due: number, askedAt: number): string =>
  `You will be woken in this thread at ${utc(due)}, in ${howLong(due - askedAt)}, with your note. You can end your turn now.`;

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
