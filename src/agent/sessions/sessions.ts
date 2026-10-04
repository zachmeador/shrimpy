import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { SessionSummary } from "../../contracts/agent/index.ts";
import type { Turns } from "../intake/index.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { ThreadsDoc, type ThreadSession } from "./documents.ts";
import { type ServedSession, serveSession } from "./service.ts";
import { createTurns } from "./turns.ts";

const context = BACKGROUND_CONTEXT;

/** The agent's sessions: one for each thread it takes part in, addressed by the thread's ID. */
export interface Sessions {
  /** Every session, in the order they were made, with whether each has work now. */
  list(): Promise<SessionSummary[]>;
  /** Whether the agent has a session for the thread. */
  has(threadId: string): Promise<boolean>;
  /** Serve the session behind a thread to the clients that watch it. `takingInput` says whether new input may still come in. */
  serve(threadId: string, takingInput: () => boolean): Promise<ServedSession>;
  /** Make every session follow the home's model and working directory, as a new session does from the start. */
  applyDefaults(): Promise<void>;
  /** What intake hands chat messages to and keeps its records in. */
  readonly turns: Turns;
}

export function createSessions(harness: Harness, defaults: SessionDefaults): Sessions {
  const threads = async (): Promise<Record<string, ThreadSession>> =>
    (await harness.snapshot(ThreadsDoc, context))?.sessions ?? {};

  return {
    async list() {
      const sessions = await threads();
      const working = await sessionsWithWork(harness);
      return Object.entries(sessions)
        .sort(([, a], [, b]) => a.conversationId - b.conversationId)
        .map(([threadId, session]) => ({
          threadId,
          channelId: session.channelId,
          working: working.has(session.conversationId),
        }));
    },

    async has(threadId) {
      return Object.hasOwn(await threads(), threadId);
    },

    async serve(threadId, takingInput) {
      const all = await threads();
      const session = Object.hasOwn(all, threadId) ? all[threadId] : undefined;
      const conversation =
        session === undefined ? undefined : await harness.conversation(session.conversationId as ConversationId, context);
      if (conversation === undefined) throw new Error(`The agent has no session for thread ${threadId}.`);
      return serveSession(harness, conversation, context, takingInput);
    },

    async applyDefaults() {
      const change = agentChange(defaults);
      await harness.commit(async (tx) => {
        const sessions = (await tx.doc(ThreadsDoc)).sessions;
        for (const session of Object.values(sessions)) {
          await configure(tx, session.conversationId as ConversationId, change);
        }
      }, context);
    },

    turns: createTurns(harness, defaults),
  };
}

/** The sessions with input they are answering or have queued. */
async function sessionsWithWork(harness: Harness): Promise<Set<number>> {
  const { submissions } = await harness.inspect(context);
  return new Set(submissions.filter((submission) => submission.type === "input").map((submission) => submission.conversationId));
}
