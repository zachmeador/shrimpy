import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Message, Receipt, Thread } from "../../contracts/chat/index.ts";
import { enterAsPerson, memberNamed } from "../../contracts/chat/testing/index.ts";
import { eventually } from "../../lib/testing/index.ts";

/** The person's DM with an agent on a real chat server, and what they can do in it. */
export interface Talk {
  /** The main thread of the DM. */
  readonly thread: Thread;
  /** Say something in the thread. */
  say(text: string): Promise<Message>;
  /** Everything said in the thread, oldest first. */
  said(): Promise<Message[]>;
  /** What the agent said in the thread, oldest first. */
  replies(): Promise<Message[]>;
  /** The receipt the agent leaves on the post of a message, once it has. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
}

/**
 * The person who runs the gateway, connected to the chat server by its name
 * through the gateway, in a DM with the agent called `agentName`, once that has
 * joined the roster. The connection is closed when the test ends.
 */
export async function talkTo(t: TestContext, agentName: string): Promise<Talk> {
  const connection = await enterAsPerson(t);
  const agent = await memberNamed(t, agentName);
  const dm = await connection.chat.openDm(agent.id);
  const thread = (await connection.chat.threads(dm.id)).find((candidate) => candidate.main);
  if (thread === undefined) throw new Error(`The DM ${dm.id} has no main thread`);

  const said = (): Promise<Message[]> => connection.chat.read(thread.id, null, 200);
  const receiptOf = async (message: Message): Promise<Receipt | undefined> =>
    (await said()).find((candidate) => candidate.id === message.id)?.receipts.find((receipt) => receipt.event === message.event);
  const talk: Talk = {
    thread,
    say: (text) => connection.chat.post(thread.id, text, `talk-${randomUUID()}`),
    said,
    async replies() {
      return (await said()).filter((message) => message.author.id === agent.id);
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
