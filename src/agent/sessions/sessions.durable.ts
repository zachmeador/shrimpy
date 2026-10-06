import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { SessionPlace, SessionSummary } from "../../contracts/agent/index.ts";
import { agentChange, type SessionDefaults, type SessionRecord, SessionsDoc } from "../records/durable.ts";
import { serveSession, type ServedSession } from "./service.durable.ts";

const context = BACKGROUND_CONTEXT;

/**
 * The agent's sessions, each addressed by a name: a thread's ID for the session
 * behind a thread, which there is one of for each thread the agent takes part
 * in, and `trigger:` and the trigger's name for a trigger's own session.
 */
export interface Sessions {
  /** Every session, in the order they were made, with where each is, if the agent has learned it, and whether it has work now. */
  list(): Promise<SessionSummary[]>;
  /** Whether the agent has a session with this address. */
  has(address: string): Promise<boolean>;
  /** Serve the session with this address to the clients that watch it. `takingInput` says whether new input may still come in. */
  serve(address: string, takingInput: () => boolean): Promise<ServedSession>;
  /** Make every session follow the home's model and working directory, as a new session does from the start. */
  applyDefaults(): Promise<void>;
}

export function createSessions(harness: Harness, defaults: SessionDefaults): Sessions {
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
          place: placeSeen(session),
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
  };
}

/**
 * Where a session is, as clients see it: a trigger's own session by its trigger,
 * a thread's by the place the agent learned there without who else is in a room,
 * and nothing for one that has not learned it.
 */
function placeSeen(session: SessionRecord): SessionPlace | null {
  if (session.channelId === null) return { kind: "trigger", trigger: session.trigger };
  const { place } = session;
  if (place === undefined) return null;
  const thread = { main: place.thread.main, name: place.thread.name };
  if (place.kind === "dm") return { kind: "dm", with: { name: place.with.name, kind: place.with.kind }, thread };
  return { kind: "room", room: place.room, thread };
}

/** The sessions with input they are answering or have queued. */
async function sessionsWithWork(harness: Harness): Promise<Set<number>> {
  const { submissions } = await harness.inspect(context);
  return new Set(submissions.filter((submission) => submission.type === "input").map((submission) => submission.conversationId));
}
