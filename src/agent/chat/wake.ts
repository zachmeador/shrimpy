import type { Channel, ChatEvent, Member } from "../../contracts/chat/index.ts";
import type { WakePolicy } from "../home/index.ts";
import type { ChatInput, Snapshot } from "../inputs/index.ts";

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
 * Whether an event wakes the agent for nothing, whatever its policy: what the
 * agent did itself, which comes back in its feed and would never end; an event
 * of a message that was taken back, which is nothing to act on, and whose text
 * is gone; and one the agent has dealt with already, perhaps before it lost its
 * records.
 */
export function passedOver(self: Member, event: ChatEvent): boolean {
  return event.actor.id === self.id || event.message.deleted || event.receipts.some((receipt) => receipt.memberId === self.id);
}

/**
 * Whether a post or an edit in a DM wakes the agent: it does when the other
 * member wrote it, whatever the text says.
 */
export function wakesInDm(self: Member, author: Member): boolean {
  return author.id !== self.id;
}

/**
 * Whether a post or an edit by `author` that mentions the members `mentions`
 * wakes the agent under `policy` in a room: it does when it mentions the agent;
 * when the policy is `people` and a person wrote it and mentioned nobody, so
 * that it is for every agent in the room; and when the policy is `all`. A person
 * who names members is talking to them, and the others only see it in what they
 * read when something wakes them.
 */
export function wakesInRoom(self: Member, policy: WakePolicy, author: Member, mentions: readonly string[]): boolean {
  if (mentions.includes(self.id)) return true;
  return policy === "all" || (policy === "people" && author.kind === "person" && mentions.length === 0);
}

/**
 * Whether an event the agent takes up joins the turn that is running, which
 * reads it at its next step, once the tools of the step it is on have finished:
 * a post or an edit that a person wrote, whoever it mentions. Nothing is cut
 * short for it. It is the same in a room and in a DM. An agent's message waits
 * for the next turn, whoever it mentions, so that two agents can't keep each
 * other's turns going, and so do an answer and a reaction.
 */
export function isUrgentPost(event: ChatEvent): boolean {
  return event.actor.kind === "person" && (event.kind === "posted" || event.kind === "edited");
}

/**
 * What an event means to the agent under the wake policy of the room it is in,
 * or in a DM, which has none: what it takes up of it, or nothing when the event
 * does not wake it. `where` says which of the two the event is in. Chat offers
 * every event and filters none, so this is where an event gets its meaning.
 *
 * Under `none` nothing wakes the agent. Otherwise it wakes for a reaction to a
 * message it wrote, which is an answer to it; for a post, or an edit of one, that
 * `wakesInDm` or `wakesInRoom` says wakes it; and in a room for an answered
 * receipt that another member leaves on a message of the agent's own that
 * mentioned them, which is an answer in words whether or not their reply
 * mentions the agent: it is taken up as the reply it points to. In a DM the reply
 * wakes the agent by itself, so a receipt that points to it wakes it for nothing.
 * Deletes, reactions taken back, reactions to anyone else's message and every
 * other receipt, whoever left them and whatever message they name, wake it for
 * nothing.
 */
export function wakingOf(self: Member, event: ChatEvent, policy: WakePolicy, where: Channel["kind"]): Waking | undefined {
  if (policy === "none" || passedOver(self, event)) return undefined;
  const { message } = event;
  const wakesAsPost = where === "dm" ? wakesInDm(self, event.actor) : wakesInRoom(self, policy, event.actor, message.mentions);

  const taken = (snapshot: Snapshot): Waking => ({
    kind: "event",
    taken: { event: snapshot, threadId: message.threadId, channelId: message.channelId },
  });
  const { id, seq } = event;
  switch (event.kind) {
    case "posted":
      if (!wakesAsPost) return undefined;
      return taken({ kind: "posted", id, seq, author: message.author.name, sentAt: message.sentAt, text: event.text });
    case "edited":
      if (!wakesAsPost) return undefined;
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
      // In a room, the message is the agent's own and mentioned the member who answered it.
      if (where === "dm" || event.status !== "answered" || event.reply === null) return undefined;
      if (message.author.id !== self.id || !message.mentions.includes(event.actor.id)) return undefined;
      return { kind: "answer", receipt: event, reply: event.reply };
    case "deleted":
    case "unreacted":
      return undefined;
  }
}
