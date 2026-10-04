import type { Message } from "../../contracts/chat/index.ts";
import type { Outstanding, Snapshot } from "./turns.ts";

export function snapshotOf(message: Message): Snapshot {
  return { id: message.id, seq: message.seq, author: message.author.name, text: message.text, sentAt: message.sentAt };
}

/**
 * What the model is shown for a message: its text under a line that says who
 * wrote it and when, after any earlier messages of the thread the agent has not
 * acted on, each the same way and oldest first. The final format belongs to the
 * work on what the model receives; this is the least that tells it who is
 * speaking, and it is the one place that decides.
 */
export function promptFor(outstanding: Outstanding): string {
  return [...outstanding.earlier, outstanding.message].map(written).join("\n\n");
}

function written(message: Snapshot): string {
  return `${message.author} wrote at ${time(message.sentAt)}:\n${message.text}`;
}

/** UTC to the second, so the model reads the same time whatever machine the agent runs on. */
function time(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
}
