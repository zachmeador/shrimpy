import type { Message } from "../../contracts/chat/index.ts";
import { isOccurrence, isWakeup, type Occurrence, type Outstanding, type Snapshot, threadOf, type Wakeup } from "./events.ts";

/**
 * What the model is shown for an input, and the one place that decides: the
 * thread and channel it is in, if it is in one, then which of the wake-ups it
 * asked for were cancelled since it last heard of them, if any, then the input
 * itself. A chat event is shown under a line that says what happened and when,
 * after any earlier events of the thread the agent has not acted on, each the
 * same way and oldest first. A wake-up says that the agent asked for it, when,
 * for when, and what it wrote itself. An occurrence of a trigger says which
 * trigger it is, when it fired and what its schedule is, and then gives the
 * trigger's prompt as it is. These facts travel with the input and are never
 * part of the prompt sections, which stay the same on every request. The final
 * format belongs to the work on what the model receives.
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
  return [...outstanding.earlier, outstanding.event].map(written).join("\n\n");
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
    : " You are not in a thread, so what you write last is posted nowhere. To tell someone something, use send_message with to: @name.";
  return `This is the trigger ${occurrence.trigger}, ${how} at ${utc(occurrence.firedAt)}. Its schedule is ${occurrence.schedule}.${where}\n\n${occurrence.prompt}`;
}

/** A wake-up that has come, as the model reads it. */
function woken(wakeup: Wakeup): string {
  return (
    "This is a wake-up you asked for with check_back. " +
    `You asked at ${utc(wakeup.askedAt)}, and it was for ${utc(wakeup.due)}. Your note:\n${wakeup.note}`
  );
}

/** The wake-ups that were cancelled, each with when it was for, when it was asked for and its note on one line. */
function cancellations(cancelled: Wakeup[]): string {
  const lines = cancelled.map(
    (wakeup) => `- for ${utc(wakeup.due)}, asked at ${utc(wakeup.askedAt)}: ${wakeup.note.replace(/\s+/g, " ").trim()}`,
  );
  return [
    "Your work was stopped, so these wake-ups you had asked for were cancelled and will not come. " +
      "Ask again with check_back for any you still want:",
    ...lines,
  ].join("\n");
}

/**
 * One event as the model reads it. A post is the message as written. An edit
 * says which message it changed by when that was sent, and gives what it now
 * says. A reaction says who reacted with what, and to which of the agent's
 * messages by when it was sent and how it starts.
 */
export function written(event: Snapshot): string {
  switch (event.kind) {
    case "posted":
      return `${event.author} wrote at ${utc(event.sentAt)}:\n${event.text}`;
    case "edited":
      return `${event.author} edited their message from ${utc(event.sentAt)} at ${utc(event.at)}. It now reads:\n${event.text}`;
    case "reacted":
      return `${event.by} reacted with ${event.emoji} at ${utc(event.at)} to your message from ${utc(event.sentAt)}, which starts:\n${event.start}`;
  }
}

/**
 * A message as it now stands, for the model to read back: who wrote it and
 * when, what it says, whether it was edited or deleted, and who reacted with
 * what. `nameOf` says what a member is called.
 */
export function standing(message: Message, nameOf: (memberId: string) => string): string {
  const sent = `${message.author.name} wrote at ${utc(message.sentAt)}`;
  if (message.deleted) return `${sent}, and deleted it.`;
  const lines = [message.editedAt === null ? `${sent}:` : `${sent}, and edited it at ${utc(message.editedAt)}:`, message.text];
  if (message.reactions.length > 0) {
    const reactions = message.reactions.map((reaction) => `${reaction.emoji} by ${list(reaction.memberIds.map(nameOf))}`);
    lines.push(`Reactions: ${reactions.join(", ")}`);
  }
  return lines.join("\n");
}

/** Names as a sentence would give them: "Zach", "Zach and scout", "Zach, scout and maya". */
function list(names: string[]): string {
  const last = names.at(-1);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${last}`;
}

/** UTC to the second, so the model reads the same time whatever machine the agent runs on. */
export function utc(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
}
