import { type ChatEvent, type Member, mentions } from "../../contracts/chat/index.ts";
import type { ChatInput, Snapshot } from "./events.ts";
import type { WakePolicy } from "./policy.ts";

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
 * Whether a post or an edit by `author` that is addressed to `addressed` wakes
 * the agent under `policy`: it does when it is addressed to the agent, which in
 * a DM every message from the other member is; when the policy is `people` and
 * a person wrote it and mentioned nobody, so that it is for every agent in the
 * room; and when the policy is `all`. A person who names members is talking to
 * them, and the others only see it in what they read when something wakes them.
 */
export function wakesAsPost(self: Member, policy: WakePolicy, author: Member, addressed: readonly string[]): boolean {
  if (addressed.includes(self.id)) return true;
  return policy === "all" || (policy === "people" && author.kind === "person" && addressed.length === 0);
}

/**
 * Whether what the agent took up of an event is urgent, which is how a person
 * says it can't wait for the turn that is running: a post or an edit that a
 * person wrote and that mentions the agent, as `@name` or `@all`. It is the same
 * in a room and in a DM. An agent's message is never urgent, whoever it
 * mentions, and neither is an answer or a reaction.
 *
 * In a room, chat worked out who the message is for, and the audience in `taken`
 * says whether that is the agent. A DM has no audience, because every message in
 * it is for the other member whatever it says, so the text is asked, by the rule
 * chat uses.
 */
export function isUrgentPost(self: Member, event: ChatEvent, taken: Taken): boolean {
  const { event: snapshot } = taken;
  if (event.actor.kind !== "person" || (snapshot.kind !== "posted" && snapshot.kind !== "edited")) return false;
  return snapshot.to === undefined ? mentions(snapshot.text, self.name) : snapshot.to.you;
}

/**
 * What an event means to the agent under the wake policy of the room it is in,
 * or of a DM, which has none: what it takes up of it, or nothing when the event
 * does not wake it. Chat offers every event and filters none, so this is where an
 * event gets its meaning.
 *
 * Under `none` nothing wakes the agent. Otherwise it wakes for a reaction to a
 * message it wrote, which is an answer to it; for a post, or an edit of one, that
 * `wakesAsPost` says wakes it; and for an answered receipt that another member
 * leaves on a message of the agent's own that was for them, which is an answer in
 * words whether or not their reply mentions the agent: it is taken up as the reply
 * it points to. Deletes, reactions taken back, reactions to anyone else's message
 * and every other receipt, whoever left them and whatever message they name, wake
 * it for nothing.
 */
export function takeUp(self: Member, event: ChatEvent, policy: WakePolicy): Waking | undefined {
  if (policy === "none" || passedOver(self, event)) return undefined;
  const { message } = event;

  const taken = (snapshot: Snapshot): Waking => ({
    kind: "event",
    taken: { event: snapshot, threadId: message.threadId, channelId: message.channelId },
  });
  const { id, seq } = event;
  switch (event.kind) {
    case "posted":
      if (!wakesAsPost(self, policy, event.actor, message.addressed)) return undefined;
      return taken({ kind: "posted", id, seq, author: message.author.name, sentAt: message.sentAt, text: event.text });
    case "edited":
      if (!wakesAsPost(self, policy, event.actor, message.addressed)) return undefined;
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
