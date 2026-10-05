import type { Message } from "../../contracts/chat/index.ts";
import { isWakeup, type Outstanding, type Snapshot, type Wakeup } from "./events.ts";

/**
 * What the model is shown for an input, and the one place that decides: the
 * thread and channel it is in, then which of the wake-ups it asked for were
 * cancelled since it last heard of them, if any, then the input itself. A chat
 * event is shown under a line that says what happened and when, after any
 * earlier events of the thread the agent has not acted on, each the same way
 * and oldest first. A wake-up says that the agent asked for it, when, for when,
 * and what it wrote itself. These facts travel with the input and are never
 * part of the prompt sections, which stay the same on every request. The final
 * format belongs to the work on what the model receives.
 */
export function promptFor(outstanding: Outstanding): string {
  const body = isWakeup(outstanding)
    ? woken(outstanding.wakeup)
    : [...outstanding.earlier, outstanding.event].map(written).join("\n\n");
  const cancelled = outstanding.cancelled ?? [];
  return [
    `Thread ${outstanding.threadId} in channel ${outstanding.channelId}.`,
    ...(cancelled.length === 0 ? [] : [cancellations(cancelled)]),
    body,
  ].join("\n\n");
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
