import type { Message } from "../../contracts/chat/index.ts";
import type { Outstanding, Snapshot } from "./turns.ts";

export function snapshotOf(message: Message): Snapshot {
  return { id: message.id, seq: message.seq, author: message.author.name, text: message.text, sentAt: message.sentAt };
}

/**
 * What the model is shown for a message, and the one place that decides: the
 * thread and channel it is in, then the message under a line that says who
 * wrote it and when, after any earlier messages of the thread the agent has not
 * acted on, each the same way and oldest first. These facts travel with the
 * input and are never part of the prompt sections, which stay the same on every
 * request. The final format belongs to the work on what the model receives.
 */
export function promptFor(outstanding: Outstanding): string {
  const messages = [...outstanding.earlier, outstanding.message].map(written).join("\n\n");
  return `Thread ${outstanding.threadId} in channel ${outstanding.channelId}.\n\n${messages}`;
}

/** One message as the model reads it: who wrote it and when, then the text as written. */
export function written(message: Pick<Snapshot, "author" | "sentAt" | "text">): string {
  return `${message.author} wrote at ${time(message.sentAt)}:\n${message.text}`;
}

/** UTC to the second, so the model reads the same time whatever machine the agent runs on. */
function time(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
}
