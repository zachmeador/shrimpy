import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import type { Outstanding, Snapshot } from "./turns.ts";

/** What the agent takes up of an event, with where it came from. */
export type Taken = Omit<Outstanding, "earlier">;

/**
 * The agent's default wake policy: what it takes up of an event, or nothing
 * when the event does not wake it. Chat offers every event and filters none,
 * so this is where an event gets its meaning, and where the policy an agent
 * sets for itself will go.
 *
 * It wakes for a post addressed to it, which in a DM is every post from the
 * other member; for an edit of a message addressed to it; and for a reaction
 * to a message it wrote, which is an answer to it. Deletes, reactions taken
 * back, reactions to anyone else's message and receipts, whoever left them and
 * whatever message they name, wake it for nothing.
 */
export function takeUp(self: Member, event: ChatEvent): Taken | undefined {
  const { message } = event;
  // What the agent did itself never wakes it: its replies come back in its feed, and answering them would never end.
  if (event.actor.id === self.id) return undefined;
  // A message that was taken back is nothing to act on, and its text is gone.
  if (message.deleted) return undefined;
  // Dealt with already, perhaps by an agent that has lost its records since.
  if (event.receipts.some((receipt) => receipt.memberId === self.id)) return undefined;

  const taken = (snapshot: Snapshot): Taken => ({ event: snapshot, threadId: message.threadId, channelId: message.channelId });
  const { id, seq } = event;
  switch (event.kind) {
    case "posted":
      if (!message.addressed.includes(self.id)) return undefined;
      return taken({ kind: "posted", id, seq, author: message.author.name, sentAt: message.sentAt, text: event.text });
    case "edited":
      if (!message.addressed.includes(self.id)) return undefined;
      return taken({
        kind: "edited",
        id,
        seq,
        author: message.author.name,
        sentAt: message.sentAt,
        at: event.at,
        text: event.text,
      });
    case "reacted":
      if (message.author.id !== self.id) return undefined;
      return taken({
        kind: "reacted",
        id,
        seq,
        by: event.actor.name,
        at: event.at,
        emoji: event.emoji,
        sentAt: message.sentAt,
        start: message.preview,
      });
    case "deleted":
    case "unreacted":
    case "receipted":
      return undefined;
  }
}
