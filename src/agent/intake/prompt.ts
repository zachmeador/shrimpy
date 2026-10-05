import type { Message } from "../../contracts/chat/index.ts";
import type { Outstanding, Snapshot } from "./events.ts";

/**
 * What the model is shown for an event, and the one place that decides: the
 * thread and channel it is in, then the event under a line that says what
 * happened and when, after any earlier events of the thread the agent has not
 * acted on, each the same way and oldest first. These facts travel with the
 * input and are never part of the prompt sections, which stay the same on every
 * request. The final format belongs to the work on what the model receives.
 */
export function promptFor(outstanding: Outstanding): string {
  const events = [...outstanding.earlier, outstanding.event].map(written).join("\n\n");
  return `Thread ${outstanding.threadId} in channel ${outstanding.channelId}.\n\n${events}`;
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
      return `${event.author} wrote at ${time(event.sentAt)}:\n${event.text}`;
    case "edited":
      return `${event.author} edited their message from ${time(event.sentAt)} at ${time(event.at)}. It now reads:\n${event.text}`;
    case "reacted":
      return `${event.by} reacted with ${event.emoji} at ${time(event.at)} to your message from ${time(event.sentAt)}, which starts:\n${event.start}`;
  }
}

/**
 * A message as it now stands, for the model to read back: who wrote it and
 * when, what it says, whether it was edited or deleted, and who reacted with
 * what. `nameOf` says what a member is called.
 */
export function standing(message: Message, nameOf: (memberId: string) => string): string {
  const sent = `${message.author.name} wrote at ${time(message.sentAt)}`;
  if (message.deleted) return `${sent}, and deleted it.`;
  const lines = [message.editedAt === null ? `${sent}:` : `${sent}, and edited it at ${time(message.editedAt)}:`, message.text];
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
function time(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/, "Z");
}
