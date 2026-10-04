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
  /**
   * Wait until the agent is taking part in chat. An agent that has just started
   * takes its place at the head of the log when it first connects, and what was
   * said before that is not its to answer, so this says something now and then
   * until the agent answers one of them, and returns once it has answered all.
   */
  awaitAgent(): Promise<void>;
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
    async awaitAgent() {
      const probes: Message[] = [];
      /** The first probe the agent has answered. Those sent before it may have been said before the agent took its place. */
      const firstAnswered = async (): Promise<Message | undefined> => {
        for (const probe of probes) if ((await receiptOf(probe)) !== undefined) return probe;
        return undefined;
      };
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        probes.push(await talk.say("hello?"));
        const first = await eventually(firstAnswered, (found) => found !== undefined, { timeoutMs: 3000 }).catch(() => undefined);
        if (first === undefined) continue;
        // Every probe the agent could answer is answered before the test goes on, so none of them is answered in the middle of it.
        for (const sent of probes.filter((probe) => probe.seq >= first.seq)) await talk.receiptOn(sent, 240_000);
        return;
      }
      throw new Error("The agent did not take part in chat within a minute");
    },
  };
  return talk;
}
