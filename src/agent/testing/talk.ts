import { randomUUID } from "node:crypto";
import type { ChatConnection, Member, Message, Receipt, Thread } from "../../contracts/chat/index.ts";
import { eventually } from "../../lib/testing/index.ts";
import type { ChatServer } from "./chat-server.ts";
import { scout, zach } from "./names.ts";

/** A person's side of a DM with an agent, on a chat server that may go away and come back. */
export interface Talk {
  /** The main thread of the DM. */
  readonly thread: Thread;
  /** Start a side thread in the DM. */
  newThread(name?: string): Promise<Thread>;
  /** Say something in a thread, the DM's main thread unless another is given. */
  say(text: string, threadId?: string): Promise<Message>;
  /** Everything said in a thread, oldest first. */
  said(threadId?: string): Promise<Message[]>;
  /** What the agent said in a thread, oldest first. */
  replies(threadId?: string): Promise<Message[]>;
  /** The IDs of the members chat says are working in a thread. */
  working(threadId?: string): Promise<string[]>;
  /** Resolve once the agent is marked as working in a thread. */
  untilWorking(threadId?: string): Promise<void>;
  /** Resolve once nobody is marked as working in a thread. */
  untilIdle(threadId?: string): Promise<void>;
  /** Resolve with the receipt the agent leaves on a message. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
}

/**
 * Zach, in his DM with the agent Scout on `chat`, made if need be. He connects
 * again by himself when the chat server has been away.
 */
export async function talkTo(chat: ChatServer, agent: Member = scout, person: Member = zach): Promise<Talk> {
  let connected: Promise<ChatConnection> | undefined;
  const connection = (): Promise<ChatConnection> => {
    connected ??= chat.join(person).then(
      (joined) => {
        joined.onDisconnect(() => {
          connected = undefined;
        });
        return joined;
      },
      (error: unknown) => {
        connected = undefined;
        throw error;
      },
    );
    return connected;
  };

  const { chat: client } = await connection();
  const dm = await client.openDm(agent);
  const thread = (await client.threads(dm.id)).find((candidate) => candidate.main);
  if (thread === undefined) throw new Error(`The DM ${dm.id} has no main thread`);

  const said = async (threadId = thread.id): Promise<Message[]> => (await connection()).chat.read(threadId, null, 200);
  const working = async (threadId = thread.id): Promise<string[]> => {
    const found = (await (await connection()).chat.threads(dm.id)).find((candidate) => candidate.id === threadId);
    return found?.working.map((mark) => mark.memberId) ?? [];
  };
  return {
    thread,
    async newThread(name) {
      return (await connection()).chat.createThread(dm.id, name ?? null);
    },
    async say(text, threadId = thread.id) {
      return (await connection()).chat.post(threadId, text, randomUUID());
    },
    said,
    async replies(threadId) {
      return (await said(threadId)).filter((message) => message.author.id === agent.id);
    },
    working,
    async untilWorking(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length > 0, { what: "the agent to take a message up" });
    },
    async untilIdle(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length === 0, { what: "the mark to be cleared" });
    },
    receiptOn: (message, timeoutMs) =>
      eventually(
        async () => (await said(message.threadId)).find((candidate) => candidate.id === message.id)?.receipts.find((r) => r.memberId === agent.id),
        (receipt) => receipt !== undefined,
        { what: `a receipt on "${message.text}"`, timeoutMs },
      ) as Promise<Receipt>,
  };
}
