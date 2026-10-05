import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { SessionSummary } from "../../contracts/agent/index.ts";
import type { Admissions, Working } from "../intake/index.ts";
import { createAdmissions } from "./admissions.ts";
import { beginRun, type Run } from "./crashes.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { type SessionRecord, SessionsDoc } from "./documents.ts";
import { type ServedSession, serveSession } from "./service.ts";
import type { TurnTask } from "./turn-task.ts";
import { createWorking } from "./working.ts";

const context = BACKGROUND_CONTEXT;

/**
 * The agent's sessions, each addressed by a name: a thread's ID for the session
 * behind a thread, which there is one of for each thread the agent takes part
 * in, and `trigger:` and the trigger's name for a trigger's own session.
 */
export interface Sessions {
  /** Every session, in the order they were made, with whether each has work now. */
  list(): Promise<SessionSummary[]>;
  /** Whether the agent has a session with this address. */
  has(address: string): Promise<boolean>;
  /** Serve the session with this address to the clients that watch it. `takingInput` says whether new input may still come in. */
  serve(address: string, takingInput: () => boolean): Promise<ServedSession>;
  /** Make every session follow the home's model and working directory, as a new session does from the start. */
  applyDefaults(): Promise<void>;
  /**
   * Begin the agent's run: say in the records that it is running, and count the crash of every turn that the last
   * run, if it ended without an orderly stop, left underway. A turn that has crashed twice is stopped, so that it
   * does not run again, and its source is told it failed. Call it once, before the engine resumes.
   */
  start(): Promise<Run>;
  /** What intake takes events up through, and keeps its place in the feed with. */
  readonly admissions: Admissions;
  /** What intake asks about the inputs taken up and not yet told to their sources. */
  readonly working: Working;
}

export function createSessions(harness: Harness, defaults: SessionDefaults, turn: TurnTask): Sessions {
  const records = async (): Promise<Record<string, SessionRecord>> =>
    (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};

  return {
    async list() {
      const sessions = await records();
      const working = await sessionsWithWork(harness);
      return Object.entries(sessions)
        .sort(([, a], [, b]) => a.conversationId - b.conversationId)
        .map(([address, session]) => ({
          id: address,
          threadId: session.channelId === null ? null : address,
          channelId: session.channelId,
          working: working.has(session.conversationId),
        }));
    },

    async has(address) {
      return Object.hasOwn(await records(), address);
    },

    async serve(address, takingInput) {
      const all = await records();
      const session = Object.hasOwn(all, address) ? all[address] : undefined;
      const conversation =
        session === undefined ? undefined : await harness.conversation(session.conversationId as ConversationId, context);
      if (conversation === undefined) throw new Error(`The agent has no session ${address}.`);
      return serveSession(harness, conversation, context, takingInput);
    },

    async applyDefaults() {
      const change = agentChange(defaults);
      await harness.commit(async (tx) => {
        const sessions = (await tx.doc(SessionsDoc)).sessions;
        for (const session of Object.values(sessions)) {
          await configure(tx, session.conversationId as ConversationId, change);
        }
      }, context);
    },

    start: () => beginRun(harness),

    admissions: createAdmissions(harness, defaults, turn),
    working: createWorking(harness),
  };
}

/** The sessions with input they are answering or have queued. */
async function sessionsWithWork(harness: Harness): Promise<Set<number>> {
  const { submissions } = await harness.inspect(context);
  return new Set(submissions.filter((submission) => submission.type === "input").map((submission) => submission.conversationId));
}
