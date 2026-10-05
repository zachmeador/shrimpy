import type { Message } from "../../contracts/chat/index.ts";
import { localTime } from "../../lib/time/index.ts";
import {
  type Audience,
  type Backlog,
  type ChatInput,
  isOccurrence,
  isWakeup,
  type Occurrence,
  type Outstanding,
  type Snapshot,
  threadOf,
  type Wakeup,
} from "./events.ts";

/**
 * What the model is shown for an input, and the one place that decides: the
 * thread and channel it is in, if it is in one, then which of the wake-ups it
 * asked for were cancelled since it last heard of them, if any, then the input
 * itself. A chat event is shown under a line that says what happened and when,
 * after any earlier events of the thread the agent has not acted on, each the
 * same way and oldest first. In a room, what was said in the thread since the
 * agent last looked comes between those and the event, each message as one that
 * arrives is shown, and a message says who it was for. A wake-up says that the
 * agent asked for it, when, for when, and what it wrote itself. An occurrence of
 * a trigger says which trigger it is, when it fired and what its schedule is,
 * and then gives the trigger's prompt as it is. These facts travel with the
 * input and are never part of the prompt sections, which stay the same on every
 * request. The final format belongs to the work on what the model receives.
 */
export function promptFor(outstanding: Outstanding): string {
  const thread = threadOf(outstanding);
  const cancelled = outstanding.cancelled ?? [];
  return [
    ...(thread === undefined ? [] : [`Thread ${thread.threadId} in channel ${thread.channelId}.`]),
    ...(cancelled.length === 0 ? [] : [cancellations(cancelled)]),
    bodyOf(outstanding),
  ].join("\n\n");
}

function bodyOf(outstanding: Outstanding): string {
  if (isWakeup(outstanding)) return woken(outstanding.wakeup);
  if (isOccurrence(outstanding)) return fired(outstanding.occurrence, threadOf(outstanding) !== undefined);
  return chatBody(outstanding);
}

/** The text that opens what was said since the agent last looked, and the line that says which message woke it. */
const SINCE_LOOKED = "Since you last looked in this thread, oldest first:";
const THEN_WOKE = "Then this woke you:";

/**
 * A chat event as the model reads it: any earlier events the agent has not
 * acted on, then, in a room, what was said since it last looked, then the event.
 */
function chatBody({ earlier, backlog, event }: ChatInput): string {
  const blocks = earlier.map(written);
  if (backlog !== undefined && (backlog.messages.length > 0 || backlog.cut > 0)) {
    blocks.push(SINCE_LOOKED, ...(backlog.cut > 0 ? [notShown(backlog, event)] : []), ...backlog.messages.map(written), THEN_WOKE);
  }
  blocks.push(written(event));
  return blocks.join("\n\n");
}

/** What says that earlier messages were left out, and how to read them: from before the oldest one shown. */
function notShown({ cut, atLeast, messages }: Backlog, event: Snapshot): string {
  const count = atLeast === true ? `At least ${cut} earlier messages are` : `${cut} earlier ${cut === 1 ? "message is" : "messages are"}`;
  return `${count} not shown here. To read them, call read_messages with before: ${messages[0]?.seq ?? event.seq}.`;
}

/**
 * An occurrence of a trigger, as the model reads it: which trigger, when it
 * fired and its schedule, and for a session with no thread that what it writes
 * last goes nowhere, and then the prompt the trigger's file gives. The prompt is
 * the instruction, from whoever wrote the trigger.
 */
function fired(occurrence: Occurrence, inThread: boolean): string {
  const how = occurrence.byHand ? "run by hand" : "fired";
  const where = inThread
    ? ""
    : " You are not in a thread, so what you write last is posted nowhere. To tell someone something, use send_message with to: @name for a DM, or to: #room for a room you are in.";
  return `This is the trigger ${occurrence.trigger}, ${how} at ${localTime(occurrence.firedAt)}. Its schedule is ${occurrence.schedule}.${where}\n\n${occurrence.prompt}`;
}

/** A wake-up that has come, as the model reads it. */
function woken(wakeup: Wakeup): string {
  return (
    "This is a wake-up you asked for with check_back. " +
    `You asked at ${localTime(wakeup.askedAt)}, and it was for ${localTime(wakeup.due)}. Your note:\n${wakeup.note}`
  );
}

/** The wake-ups that were cancelled, each with when it was for, when it was asked for and its note on one line. */
function cancellations(cancelled: Wakeup[]): string {
  const lines = cancelled.map(
    (wakeup) => `- for ${localTime(wakeup.due)}, asked at ${localTime(wakeup.askedAt)}: ${wakeup.note.replace(/\s+/g, " ").trim()}`,
  );
  return [
    "Your work was stopped, so these wake-ups you had asked for were cancelled and will not come. " +
      "Ask again with check_back for any you still want:",
    ...lines,
  ].join("\n");
}

/**
 * One event as the model reads it. A post is the message as written, with
 * when it was edited if it was and, in a room, who it was for. An edit says
 * which message it changed by when that was sent, and gives what it now says.
 * A reaction says who reacted with what, and to which of the agent's messages
 * by when it was sent and how it starts. An answer says who answered which of
 * the agent's messages, by when it was sent and how it starts, and gives the
 * reply.
 */
export function written(event: Snapshot): string {
  switch (event.kind) {
    case "posted": {
      const edited = event.editedAt === undefined ? "" : `, and edited it at ${localTime(event.editedAt)}`;
      const cut = event.clipped === true ? `\n(The rest of this message is cut here. To read all of it, call read_messages with before: ${event.seq + 1} and limit: 1.)` : "";
      return `${event.author} wrote at ${localTime(event.sentAt)}${edited}${forWhom(event.to)}:\n${event.text}${cut}`;
    }
    case "edited":
      return `${event.author} edited their message from ${localTime(event.sentAt)} at ${localTime(event.at)}. It now reads${forWhom(event.to)}:\n${event.text}`;
    case "reacted":
      return `${event.by} reacted with ${event.emoji} at ${localTime(event.at)} to your message from ${localTime(event.sentAt)}, which starts:\n${event.start}`;
    case "answered":
      return `${event.by} answered your message from ${localTime(event.sentAt)}, which starts:\n${event.start}\n\nTheir reply, written at ${localTime(event.at)}:\n${event.text}`;
  }
}

/**
 * A message as it now stands, for the model to read back: who wrote it and
 * when, what it says, whether it was edited or deleted, and who reacted with
 * what. `nameOf` says what a member is called.
 */
export function standing(message: Message, nameOf: (memberId: string) => string): string {
  const sent = `${message.author.name} wrote at ${localTime(message.sentAt)}`;
  if (message.deleted) return `${sent}, and deleted it.`;
  const lines = [message.editedAt === null ? `${sent}:` : `${sent}, and edited it at ${localTime(message.editedAt)}:`, message.text];
  if (message.reactions.length > 0) {
    const reactions = message.reactions.map((reaction) => `${reaction.emoji} by ${list(reaction.memberIds.map(nameOf))}`);
    lines.push(`Reactions: ${reactions.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Who a message in a room was for, as a clause to follow a comma, or nothing for
 * a message that has no audience, which is one in a DM: it is for the other
 * member and that needs no saying.
 */
function forWhom(to: Audience | undefined): string {
  if (to === undefined) return "";
  if (to.everyone) return ", for everyone in the room";
  if (to.you) return `, for you${to.others.length === 0 ? "" : ` and ${list(to.others)}`}`;
  return to.others.length === 0 ? ", mentioning nobody" : `, for ${list(to.others)}, not for you`;
}

/** Names as a sentence would give them: "Zach", "Zach and scout", "Zach, scout and maya". */
function list(names: string[]): string {
  const last = names.at(-1);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${last}`;
}
