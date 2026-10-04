import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { ChatEndpoint, Message } from "../../contracts/chat/index.ts";
import { enterAsAgent, gatewayAsAgent } from "../../contracts/chat/testing/index.ts";
import { runtimeDir } from "../../lib/runtime/node.ts";
import { stopAfter, within } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** What a scripted agent did with a message: the receipt it leaves, and the reply it posts first if it answered. */
export type Outcome =
  | { status: "answered"; text: string }
  | { status: "silent" }
  | { status: "stopped" }
  | { status: "skipped" }
  | { status: "failed"; detail: string };

export interface ScriptedAgentOptions {
  name: string;
  /** The chat server it joins. */
  chat: ChatEndpoint;
  /**
   * What it does with each message it is offered, one at a time. It is marked
   * as working in the message's thread until this settles, so a test can hold
   * the work by returning a promise it settles later. Work that is held must be
   * let go before the test ends, or the agent cannot leave.
   */
  handle(message: Message): Outcome | Promise<Outcome>;
  /** The version in its registration. The version of Shrimpy by default. */
  version?: string;
  /**
   * Do not register with the gateway, as an agent that is not running does not.
   * It is a member of the roster all the same.
   */
  register?: false;
}

export interface ScriptedAgent {
  /** Every message it has been offered, oldest first. */
  readonly offered: Message[];
}

/**
 * Stand in for an agent whose side of chat is not under test: it joins the
 * gateway's roster as the agent called `name`, registers there as that agent,
 * comes in to the chat server with a ticket, and for each message others post it
 * works as `handle` says and leaves the receipt. It needs the test's runtime
 * directory, with the gateway running, and it leaves when the test ends.
 */
export async function startScriptedAgent(t: TestContext, options: ScriptedAgentOptions): Promise<ScriptedAgent> {
  // Joined first, so that it is a member of the roster whether it registers or not.
  const gateway = await gatewayAsAgent(t, options.name);
  if (options.register !== false) {
    await gateway.register({
      kind: "agent",
      serverId: randomUUID(),
      socket: join(runtimeDir(), `${options.name}.sock`),
      pid: process.pid,
      version: options.version ?? SHRIMPY_VERSION,
    });
  }
  const connection = await enterAsAgent(t, options.chat, options.name);
  const self = connection.me;

  const offered: Message[] = [];
  const leaving = new AbortController();
  const work = async (message: Message): Promise<void> => {
    await connection.chat.setWorking(message.threadId, true);
    try {
      const outcome = await options.handle(message);
      const reply =
        outcome.status === "answered"
          ? await connection.chat.post(message.threadId, outcome.text, `${self.id}-reply-${message.id}`)
          : undefined;
      await connection.chat.leaveReceipt([message.id], {
        status: outcome.status,
        reply: reply?.id ?? null,
        detail: outcome.status === "failed" ? outcome.detail : null,
      });
    } finally {
      await connection.chat.setWorking(message.threadId, false);
    }
  };
  // Read through a function, so the compiler does not assume the answer it saw first still holds.
  const hasLeft = (): boolean => leaving.signal.aborted;
  // A chat server that goes away ends the agent's listening without being a failure of the test.
  let dropped = false;
  connection.onDisconnect(() => {
    dropped = true;
  });
  let cursor = await connection.chat.head();
  const listening = (async () => {
    while (!hasLeft()) {
      for (const message of await connection.chat.feed(cursor, 50, leaving.signal)) {
        if (hasLeft()) return;
        cursor = message.seq;
        if (message.author.id === self.id) continue;
        offered.push(message);
        await work(message);
      }
    }
  })().catch((error: unknown) => {
    if (!hasLeft() && !dropped) throw error;
  });
  stopAfter(t, async () => {
    leaving.abort();
    await within(5000, listening, "the scripted agent leaving (a handle that holds work must settle before the test ends)");
  });
  return { offered };
}
