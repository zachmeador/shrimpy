import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { ChatEvent } from "../../contracts/chat/index.ts";
import { enterAsAgent, gatewayAsAgent } from "../../contracts/chat/testing/index.ts";
import { runtimeDir } from "../../lib/runtime/node.ts";
import { stopAfter, within } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** A post the scripted agent was offered: a message as first written, by someone else. */
export type Posted = Extract<ChatEvent, { kind: "posted" }>;

/** What a scripted agent did with a message: the receipt it leaves, and the reply it posts first if it answered. */
export type Outcome =
  | { status: "answered"; text: string }
  | { status: "silent" }
  | { status: "stopped" }
  | { status: "skipped" }
  | { status: "failed"; detail: string };

export interface ScriptedAgentOptions {
  name: string;
  /**
   * What it does with each post it is offered, one at a time. It is marked
   * as working in the post's thread until this settles, so a test can hold
   * the work by returning a promise it settles later. Work that is held must be
   * let go before the test ends, or the agent cannot leave.
   */
  handle(post: Posted): Outcome | Promise<Outcome>;
  /** The version in its registration. The version of Shrimpy by default. */
  version?: string;
  /**
   * Do not register with the gateway, as an agent that is not running does not.
   * It is a member of the roster all the same.
   */
  register?: false;
}

export interface ScriptedAgent {
  /** Every post it has been offered, oldest first. */
  readonly offered: Posted[];
}

/**
 * Stand in for an agent whose side of chat is not under test: it joins the
 * gateway's roster as the agent called `name`, registers there as that agent,
 * comes in to the chat server by its name through the gateway, and for each
 * post others make it works as `handle` says and leaves the receipt. It needs
 * the test's runtime directory, with the gateway and the chat server running,
 * and it leaves when the test ends.
 */
export async function startScriptedAgent(t: TestContext, options: ScriptedAgentOptions): Promise<ScriptedAgent> {
  // Joined first, so that it is a member of the roster whether it registers or not.
  const gateway = await gatewayAsAgent(t, options.name);
  if (options.register !== false) {
    await gateway.register({
      kind: "agent",
      serverId: randomUUID(),
      socket: join(runtimeDir(), `${options.name}.sock`),
      version: options.version ?? SHRIMPY_VERSION,
    });
  }
  const connection = await enterAsAgent(t, options.name);
  const self = connection.me;

  const offered: Posted[] = [];
  const leaving = new AbortController();
  const work = async (post: Posted): Promise<void> => {
    const { threadId } = post.message;
    await connection.chat.setWorking(threadId, true);
    try {
      const outcome = await options.handle(post);
      const reply =
        outcome.status === "answered"
          ? await connection.chat.post(threadId, outcome.text, `${self.id}-reply-${post.id}`)
          : undefined;
      await connection.chat.leaveReceipt([post.id], {
        status: outcome.status,
        reply: reply?.id ?? null,
        detail: outcome.status === "failed" ? outcome.detail : null,
      });
    } finally {
      await connection.chat.setWorking(threadId, false);
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
      for (const event of await connection.chat.feed(cursor, 50, leaving.signal)) {
        if (hasLeft()) return;
        cursor = event.seq;
        if (event.kind !== "posted" || event.actor.id === self.id) continue;
        offered.push(event);
        await work(event);
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
