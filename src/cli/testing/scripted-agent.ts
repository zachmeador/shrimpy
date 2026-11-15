import type { TestContext } from "node:test";
import { ChordError, createHost, defineFacet, type Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import { AgentPresence } from "../../contracts/agent/index.ts";
import { Chat, type ChatEvent, Thread } from "../../contracts/chat/index.ts";
import { agent, type Answer, hello, type Principal, readAnswer, type Revocation, revokedBy } from "../../contracts/gateway/index.ts";
import { gatewaySocket, newToken } from "../../contracts/gateway/node.ts";
import { linkTestAgent } from "../../contracts/gateway/testing/index.ts";
import { dial, keepLink } from "../../lib/link/node.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, within } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

const context = BACKGROUND_CONTEXT;

/** A post the scripted agent was offered: a message as first written, by someone else. */
export type Posted = Extract<ChatEvent, { kind: "posted" }>;

/** What a scripted agent did with a message: the receipt it leaves, and the reply it posts first if it answered. */
export type Outcome =
  | { status: "answered"; text: string }
  | { status: "silent" }
  | { status: "stopped" }
  /** A skip with a detail was behind a turn that failed; one without, behind a stop. */
  | { status: "skipped"; detail?: string }
  | { status: "failed"; detail: string };

export interface ScriptedAgentOptions {
  name: string;
  /**
   * What it does with each post it is offered, one at a time. It is marked
   * as working in the post's thread until this settles, so a test can hold
   * the work by returning a promise it settles later. Work still held when the
   * test ends is let go of, with no receipt.
   */
  handle(post: Posted): Outcome | Promise<Outcome>;
  /** The Shrimpy version its hello gives. The version of Shrimpy by default. */
  version?: string;
  /**
   * Do not stay linked to the gateway, as an agent that is not running is not:
   * it joins the roster, and is offered nothing.
   */
  linked?: false;
}

export interface ScriptedAgent {
  /** Every post it has been offered, oldest first. */
  readonly offered: Posted[];
}

/** The reason a receipt gives: a failure's, or a skip's when it has one. */
const detailOf = (outcome: Outcome): string | null =>
  outcome.status === "failed" || outcome.status === "skipped" ? (outcome.detail ?? null) : null;

function valueOf<T>(answer: Answer<T>): T {
  if (answer.kind === "refused") throw new Error(`Refused: ${answer.words}`);
  return answer.value;
}

/**
 * Stand in for an agent whose side of chat is not under test: its program
 * links to the gateway as the agent called `name`, joining the roster, with the
 * Shrimpy version the test asks for in its hello, holds chat through its link
 * as the agent, and for each post others make it works as `handle` says and
 * leaves the receipt. It needs the test's runtime directory, with the gateway
 * and the chat server running, and it leaves when the test ends.
 */
export async function startScriptedAgent(t: TestContext, options: ScriptedAgentOptions): Promise<ScriptedAgent> {
  const offered: Posted[] = [];
  if (options.linked === false) {
    const joined = await linkTestAgent(t, options.name);
    await joined.stop();
    return { offered };
  }

  const host = createHost<Principal, Revocation>({
    address: agent({ name: options.name }),
    principal: { kind: "home" },
    revokedBy,
    onError: () => undefined,
  });
  const facet = defineFacet<Principal>((serving) => {
    serving.serve(AgentPresence, () => ({ variant: "present", members: {} }));
  });
  await host.load([{ name: "@shrimpy/scripted-agent", facet }], context);
  const leaving = new AbortController();
  const token = newToken();
  // Its own hello, since it gives the version the test asks for.
  const said = { ...hello({ kind: "agent", name: options.name, token }), shrimpy: options.version ?? SHRIMPY_VERSION };
  const linking = keepLink({
    signal: leaving.signal,
    backoff: backoff({ firstMs: 5, maxMs: 50 }),
    async link(signal) {
      const { answer: raw, linked } = await dial({ path: gatewaySocket() }, said, { signal });
      const answer = readAnswer(raw);
      if (answer?.kind !== "welcome") {
        linked.drop();
        throw new Error(answer?.words ?? "The gateway answered with something else.");
      }
      host.connect(linked.link, { principal: { kind: "gateway" } }, context);
      return linked;
    },
  });

  const chat: Reference<typeof Chat> = await host.get(Chat, {}, context);
  const self = chat.you.value;
  if (self === null) throw new Error("Chat takes the scripted agent for nobody.");
  // What the agent asks of chat ends when it leaves, so that a chat server that went away holds nothing up.
  const asking = withAbortSignal(leaving.signal, context);
  const left = new Promise<undefined>((resolve) => leaving.signal.addEventListener("abort", () => resolve(undefined), { once: true }));

  const work = async (post: Posted): Promise<void> => {
    const { threadId } = post.message;
    valueOf(await chat.setWorking({ thread: threadId, working: true }, asking));
    try {
      // Work the test still holds when it ends is let go of, so the agent can leave.
      const outcome = await Promise.race([options.handle(post), left]);
      if (outcome === undefined) return;
      const reply =
        outcome.status === "answered"
          ? await host.get(Thread, { thread: threadId }, asking).then(async (thread) => {
              try {
                return valueOf(await thread.post({ text: outcome.text, request: `${self.id}-reply-${post.id}` }, asking));
              } finally {
                thread.release();
              }
            })
          : undefined;
      valueOf(
        await chat.leaveReceipt(
          { events: [post.id], receipt: { status: outcome.status, reply: reply?.id ?? null, detail: detailOf(outcome) } },
          asking,
        ),
      );
    } finally {
      await chat.setWorking({ thread: threadId, working: false }, asking).catch(() => undefined);
    }
  };

  // Read through a function, so the compiler does not assume the answer it saw first still holds.
  const hasLeft = (): boolean => leaving.signal.aborted;
  let cursor = chat.head.value;
  let moved: () => void = () => undefined;
  const head = await chat.head.watch(context);
  head.start(async () => moved());
  const listening = (async () => {
    while (!hasLeft()) {
      if (chat.head.value <= cursor) {
        await new Promise<void>((resolve) => {
          moved = resolve;
          leaving.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        continue;
      }
      for (const event of valueOf(await chat.events({ after: cursor, limit: 50 }, asking))) {
        if (hasLeft()) return;
        cursor = event.seq;
        if (event.kind !== "posted" || event.actor.id === self.id) continue;
        offered.push(event);
        await work(event);
      }
    }
  })().catch((error: unknown) => {
    // A chat server or a gateway that goes away ends the agent's listening without being a failure of the test.
    const lost = error instanceof ChordError && (error.code === "unavailable" || error.code === "released");
    if (!hasLeft() && !lost) throw error;
  });
  stopAfter(t, async () => {
    leaving.abort();
    await within(5000, listening, "the scripted agent leaving");
    await head.stop();
    chat.release();
    await linking;
    await host.close(context);
  });
  return { offered };
}
