import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import type { ChatInput, Snapshot } from "./events.ts";

/** What the agent takes up of an event, with where it came from. */
export type Taken = Omit<ChatInput, "earlier" | "cancelled">;

/** A receipt that says another member answered, which is an event of the feed like any other. */
export type Receipted = Extract<ChatEvent, { kind: "receipted" }>;

/**
 * What an event means to the agent: it is taken up as it is, or it is a receipt
 * that says someone answered a message of the agent's own, whose reply the agent
 * has to ask chat for before it can say whether that wakes it.
 */
export type Waking = { kind: "event"; taken: Taken } | { kind: "answer"; receipt: Receipted; reply: string };

/**
 * The agent's default wake policy: what it takes up of an event, or nothing
 * when the event does not wake it. Chat offers every event and filters none,
 * so this is where an event gets its meaning, and where the policy an agent
 * sets for itself will go.
 *
 * It wakes for a post addressed to it, which in a DM is every post from the
 * other member; for an edit of a message addressed to it; and for a reaction
 * to a message it wrote, which is an answer to it. An answered receipt that
 * another member leaves on a message of the agent's own that was for them is an
 * answer too, in words, whether or not their reply mentions the agent: it is
 * taken up as the reply it points to. Deletes, reactions taken back, reactions
 * to anyone else's message and every other receipt, whoever left them and
 * whatever message they name, wake it for nothing.
 */
export function takeUp(self: Member, event: ChatEvent): Waking | undefined {
  const { message } = event;
  // What the agent did itself never wakes it: its replies come back in its feed, and answering them would never end.
  if (event.actor.id === self.id) return undefined;
  // A message that was taken back is nothing to act on, and its text is gone.
  if (message.deleted) return undefined;
  // Dealt with already, perhaps by an agent that has lost its records since.
  if (event.receipts.some((receipt) => receipt.memberId === self.id)) return undefined;

  const taken = (snapshot: Snapshot): Waking => ({
    kind: "event",
    taken: { event: snapshot, threadId: message.threadId, channelId: message.channelId },
  });
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
    case "receipted":
      // The message is the agent's own and was for the member who answered it.
      if (event.status !== "answered" || event.reply === null) return undefined;
      if (message.author.id !== self.id || !message.addressed.includes(event.actor.id)) return undefined;
      return { kind: "answer", receipt: event, reply: event.reply };
    case "deleted":
    case "unreacted":
      return undefined;
  }
}
