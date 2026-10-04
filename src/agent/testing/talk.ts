import { randomUUID } from "node:crypto";
import type { ChatEvent, Member, Message, Receipt, Thread } from "../../contracts/chat/index.ts";
import type { Entered } from "../../contracts/chat/testing/index.ts";
import { eventually } from "../../lib/testing/index.ts";
import type { ChatServer } from "./chat-server.ts";
import { SCOUT } from "./names.ts";

/** A person's side of a DM with an agent, on a chat server that may go away and come back. */
export interface Talk {
  /** The person who runs the gateway, who talks to the agent. */
  readonly me: Member;
  /** The agent they talk to, as the roster has it. */
  readonly partner: Member;
  /** The main thread of the DM. */
  readonly thread: Thread;
  /** Start a side thread in the DM. */
  newThread(name?: string): Promise<Thread>;
  /** Say something in a thread, the DM's main thread unless another is given. */
  say(text: string, threadId?: string): Promise<Message>;
  /** Change what a message of theirs says. */
  edit(message: Message, text: string): Promise<Message>;
  /** Delete a message of theirs. */
  remove(message: Message): Promise<Message>;
  /** Put an emoji on a message, theirs or the agent's. */
  react(message: Message, emoji: string): Promise<Message>;
  /** Take their own emoji back off a message. */
  unreact(message: Message, emoji: string): Promise<Message>;
  /** Everything said in a thread, as it now stands, oldest first. */
  said(threadId?: string): Promise<Message[]>;
  /** What the agent said in a thread, oldest first. */
  replies(threadId?: string): Promise<Message[]>;
  /** Every event in the DM's channel, oldest first: the log, as the feed offers it. */
  events(): Promise<ChatEvent[]>;
  /** The IDs of the members chat says are working in a thread. */
  working(threadId?: string): Promise<string[]>;
  /** Resolve once the agent is marked as working in a thread. */
  untilWorking(threadId?: string): Promise<void>;
  /** Resolve once nobody is marked as working in a thread. */
  untilIdle(threadId?: string): Promise<void>;
  /** Resolve with the receipt the agent leaves on a message's post. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
  /** Resolve with the receipt the agent leaves on an event. */
  receiptFor(event: ChatEvent, timeoutMs?: number): Promise<Receipt>;
}

/**
 * The person who runs the gateway, in their DM with the agent called
 * `agentName` on `chat`, made if need be once the agent has joined the roster.
 * They come in again by themselves when the chat server has been away.
 */
export async function talkTo(chat: ChatServer, agentName: string = SCOUT): Promise<Talk> {
  let connected: Promise<Entered> | undefined;
  const connection = (): Promise<Entered> => {
    connected ??= chat.person().then(
      (entered) => {
        entered.onDisconnect(() => {
          connected = undefined;
        });
        return entered;
      },
      (error: unknown) => {
        connected = undefined;
        throw error;
      },
    );
    return connected;
  };

  const partner = await chat.member(agentName);
  const first = await connection();
  const dm = await first.chat.openDm(partner.id);
  const thread = (await first.chat.threads(dm.id)).find((candidate) => candidate.main);
  if (thread === undefined) throw new Error(`The DM ${dm.id} has no main thread`);

  const said = async (threadId = thread.id): Promise<Message[]> => (await connection()).chat.read(threadId, null, 200);
  const working = async (threadId = thread.id): Promise<string[]> => {
    const found = (await (await connection()).chat.threads(dm.id)).find((candidate) => candidate.id === threadId);
    return found?.working.map((mark) => mark.memberId) ?? [];
  };
  const receipt = (eventId: string, threadId: string, timeoutMs?: number): Promise<Receipt> =>
    eventually(
      async () =>
        (await said(threadId))
          .flatMap((message) => message.receipts)
          .find((candidate) => candidate.event === eventId && candidate.memberId === partner.id),
      (found) => found !== undefined,
      { what: `a receipt on the event ${eventId}`, timeoutMs },
    ) as Promise<Receipt>;
  return {
    me: first.me,
    partner,
    thread,
    async newThread(name) {
      return (await connection()).chat.createThread(dm.id, name ?? null);
    },
    async say(text, threadId = thread.id) {
      return (await connection()).chat.post(threadId, text, randomUUID());
    },
    async edit(message, text) {
      return (await connection()).chat.edit(message.id, text);
    },
    async remove(message) {
      return (await connection()).chat.delete(message.id);
    },
    async react(message, emoji) {
      return (await connection()).chat.react(message.id, emoji);
    },
    async unreact(message, emoji) {
      return (await connection()).chat.unreact(message.id, emoji);
    },
    said,
    async replies(threadId) {
      return (await said(threadId)).filter((message) => message.author.id === partner.id);
    },
    async events() {
      const person = await connection();
      return (await person.chat.feed(0, 200)).filter((event) => event.message.channelId === dm.id);
    },
    working,
    async untilWorking(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length > 0, { what: "the agent to take a message up" });
    },
    async untilIdle(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length === 0, { what: "the mark to be cleared" });
    },
    receiptOn: (message, timeoutMs) => receipt(message.event, message.threadId, timeoutMs),
    receiptFor: (event, timeoutMs) => receipt(event.id, event.message.threadId, timeoutMs),
  };
}
