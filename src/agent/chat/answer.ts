import type { ChatClient, Member, Message } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { WakePolicy } from "../home/index.ts";
import { type Receipted, type Taken, wakesInRoom } from "./wake.ts";

/** Messages asked for at a time when looking for a reply, and how many times: a reply is posted just before its receipt, so it is among the newest. */
const PAGE = 50;
const PAGES = 4;

/**
 * The reply that a receipt points to in a room, taken up as an answer to the
 * message of the agent's own that the receipt is on. A reply that wakes the
 * agent by itself under its policy, because it mentions the agent or a person
 * wrote it or the policy is `all`, is not taken up here, and neither is one the
 * agent has dealt with already, or that was taken back. Chat is asked for the
 * reply, since the receipt only names it. `onError` is told when it can't be
 * found. One reply that answers two messages of the agent's has a receipt on
 * each, so it is taken up for each: that is still one input for the model, one
 * reply and one receipt, because the reply's event names each of them.
 */
export async function takeUpAnswer(
  chat: ChatClient,
  self: Member,
  policy: WakePolicy,
  receipt: Receipted,
  reply: string,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<Taken | undefined> {
  const found = await findReply(chat, receipt, reply, signal);
  if (found === undefined) {
    onError(
      new Error(
        `The receipt ${receipt.id} says ${receipt.actor.name} answered a message of the agent's with ${reply}, ` +
          "but that message was not among the newest of its thread, so the agent was not woken with it.",
      ),
    );
    return undefined;
  }
  if (found.deleted || wakesInRoom(self, policy, found.author, found.mentions)) return undefined;
  if (found.receipts.some((each) => each.memberId === self.id && each.event === found.event)) return undefined;
  return {
    event: {
      kind: "answered",
      id: found.event,
      seq: found.seq,
      by: receipt.actor.name,
      at: found.sentAt,
      text: found.text,
      sentAt: receipt.message.sentAt,
      start: receipt.message.preview,
    },
    threadId: found.threadId,
    channelId: found.channelId,
  };
}

/** The message `reply` among the newest of the thread the receipt's message is in, older than the receipt. */
async function findReply(chat: ChatClient, receipt: Receipted, reply: string, signal: AbortSignal): Promise<Message | undefined> {
  let before = receipt.seq;
  for (let page = 0; page < PAGES; page++) {
    let messages: Message[];
    try {
      messages = await chat.read(receipt.message.threadId, before, PAGE, signal);
    } catch (error) {
      // A thread that chat won't show is a reply that can't be found: the agent is told, and goes on with the rest of the feed.
      if (isRefusal(error)) return undefined;
      throw error;
    }
    const found = messages.find((message) => message.id === reply);
    if (found !== undefined) return found;
    const oldest = messages[0];
    if (oldest === undefined) return undefined;
    before = oldest.seq;
  }
  return undefined;
}
