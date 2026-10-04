import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import {
  agentMember,
  type ChatConnection,
  type Member,
  type Message,
  type Receipt,
  type Thread,
} from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { eventually, stopAfter } from "../../lib/testing/index.ts";
import type { ServedChat } from "./process.ts";

const zach: Member = { id: "person:zach", kind: "person", name: "Zach" };

/** Zach's DM with an agent on a real chat server, and what he can do in it. */
export interface Talk {
  /** The main thread of the DM. */
  readonly thread: Thread;
  /** Say something in the thread. */
  say(text: string): Promise<Message>;
  /** Everything said in the thread, oldest first. */
  said(): Promise<Message[]>;
  /** What the agent said in the thread, oldest first. */
  replies(): Promise<Message[]>;
  /** The receipt the agent leaves on a message, once it has. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
}

/**
 * Zach, connected to the chat server `chat`, in a DM with the agent called
 * `agentName`. The connection is closed when the test ends.
 */
export async function talkTo(t: TestContext, chat: ServedChat["listening"], agentName: string): Promise<Talk> {
  const connection: ChatConnection = await connectLocal(chat);
  stopAfter(t, () => connection.close());
  await connection.chat.identify(zach);
  const dm = await connection.chat.openDm(agentMember(agentName));
  const thread = (await connection.chat.threads(dm.id)).find((candidate) => candidate.main);
  if (thread === undefined) throw new Error(`The DM ${dm.id} has no main thread`);

  const said = (): Promise<Message[]> => connection.chat.read(thread.id, null, 200);
  const receiptOf = async (message: Message): Promise<Receipt | undefined> =>
    (await said()).find((candidate) => candidate.id === message.id)?.receipts[0];
  const talk: Talk = {
    thread,
    say: (text) => connection.chat.post(thread.id, text, `talk-${randomUUID()}`),
    said,
    async replies() {
      return (await said()).filter((message) => message.author.id === agentMember(agentName).id);
    },
    async receiptOn(message, timeoutMs = 30_000) {
      const found = await eventually(() => receiptOf(message), (receipt) => receipt !== undefined, {
        what: `the agent's receipt on "${message.text}"`,
        timeoutMs,
      });
      return found as Receipt;
    },
  };
  return talk;
}
