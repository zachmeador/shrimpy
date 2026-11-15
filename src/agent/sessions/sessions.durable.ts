import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import { diffRevisions } from "@earendil-works/chord/delta";
import type { Models } from "@earendil-works/pi-ai";
import {
  type CommitPublication,
  type Conversation,
  type ConversationId,
  type ConversationView,
  configure,
  type EntryId,
  type EntryRecord,
  GenerationTask,
  type Harness,
  type Observation,
} from "@earendil-works/pi-durable";
import type {
  AgentModels,
  SessionPage,
  SessionPlace,
  SessionStatus,
  SessionSummary,
  Settlement,
  Submitted,
  WaitingWakeup,
} from "../../contracts/agent/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { agentChange, type SessionDefaults, type SessionRecord, SessionsDoc } from "../records/durable.ts";
import { touchesWakeups, waitingWakeups } from "../wakeups/durable.ts";
import { listModels } from "./models.durable.ts";
import { stopWork } from "./service.durable.ts";
import { pageOf, statusOf, unfinishedCalls, windowOf } from "./session-view.durable.ts";
import { waitForSettlement } from "./settlement.durable.ts";

const context = BACKGROUND_CONTEXT;

/** Entries a page looks at after its own for the results of its last tool calls, beyond one for each call. */
const SLACK = 8;

/** One session as clients see it: whether the agent has made it, the newest stretch of it and what it is doing. */
export type SessionShown = { made: boolean; window: SessionPage; status: SessionStatus | null };

const NOT_MADE: SessionShown = { made: false, window: { items: [], before: null }, status: null };

/**
 * The agent's sessions, each addressed by a name: a thread's ID for the session
 * behind a thread, which there is one of for each thread the agent takes part
 * in, and `trigger:` and the trigger's name for a trigger's own session.
 */
export interface Sessions {
  /** Every session, in the order they were made, with where each is, if the agent has learned it, and whether a turn is underway. */
  list(): Promise<SessionSummary[]>;
  /** The list, kept live from the engine's commits, as Chord's `self.follow` takes it. */
  readonly listed: FollowAttach<SessionSummary[]>;
  /**
   * The session with this address as clients see it, kept live from the
   * engine's view of it, a partial answer included, and from the wake-ups it is
   * waiting on, as Chord's `self.follow` takes it. Until the agent makes the
   * session it is not made, and it follows the session from the moment it is.
   */
  shown(address: string): FollowAttach<SessionShown>;
  /** The items of up to `limit` entries of a session from the entry `before` back, and the entry just before those. */
  read(address: string, before: number, limit: number, context: Context): Promise<SessionPage>;
  /** Put input into a session, joining its work or starting a turn. A request ID's first use wins. */
  steer(address: string, text: string, request: string, context: Context): Promise<Submitted>;
  /** How an input of a session ended, once it has. */
  wait(address: string, submission: number, context: Context): Promise<Settlement>;
  /** Stop a session's work, as a person's `/stop` in its thread does. */
  stop(address: string, context: Context): Promise<void>;
  /** The models the agent can use now, and the one its sessions follow by default, which is the home's. */
  models(): Promise<AgentModels>;
  /**
   * Make every session follow the home's model and working directory, as a new
   * session does from the start, whatever model it was given. Then show the
   * clients that follow a session what its status says now, since whether its
   * model is the home's depends on the home's.
   */
  applyDefaults(): Promise<void>;
}

/** Whether a commit changed which sessions there are, or where one is, or started or ended a turn. */
function changesList(publication: CommitPublication): boolean {
  return publication.changes.some(
    (change) =>
      (change.type === "document" && change.record.kind === SessionsDoc.definition.kind) ||
      (change.type === "task" && change.value.kind === GenerationTask.definition.name),
  );
}

/** Whether a commit changed which sessions there are. */
function changesSessions(publication: CommitPublication): boolean {
  return publication.changes.some((change) => change.type === "document" && change.record.kind === SessionsDoc.definition.kind);
}

export function createSessions(harness: Harness, defaults: SessionDefaults, models: Models): Sessions {
  const records = async (): Promise<Record<string, SessionRecord>> =>
    (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
  const recordOf = async (address: string): Promise<SessionRecord | undefined> => {
    const all = await records();
    return Object.hasOwn(all, address) ? all[address] : undefined;
  };
  const conversationOf = async (address: string, at: Context): Promise<Conversation> => {
    const session = await recordOf(address);
    const conversation = session === undefined ? undefined : await harness.conversation(session.conversationId as ConversationId, at);
    if (conversation === undefined) refuse(`This agent has no session for ${address} yet.`);
    return conversation;
  };
  /** Each session being shown, told to read its status again when the home's model changes. */
  const shownNow = new Set<() => void>();

  /** Be told after each commit that `relevant` picks, outside the commit, where the engine may be asked again. */
  const onCommits = (relevant: (publication: CommitPublication) => boolean, changed: () => void): (() => void) => {
    const observation = harness.observeCommits({
      advance(publication) {
        if (relevant(publication)) setImmediate(changed);
      },
      end: () => undefined,
    });
    return () => observation.detach();
  };

  const list = async (): Promise<SessionSummary[]> => {
    const sessions = await records();
    const working = await sessionsAtWork(harness);
    return Object.entries(sessions)
      .sort(([, a], [, b]) => a.conversationId - b.conversationId)
      .map(([address, session]) => ({
        id: address,
        threadId: session.channelId === null ? null : address,
        channelId: session.channelId,
        place: placeSeen(session),
        working: working.has(session.conversationId),
      }));
  };

  return {
    list,

    listed: follow({ read: list, watch: (changed) => onCommits(changesList, changed) }),

    shown(address) {
      return async (observer) => {
        // Read through functions: each changes while the session is waited for or attached to.
        const state = { attaching: false, detached: false, ready: false, scheduled: false };
        const detached = (): boolean => state.detached;
        const attaching = (): boolean => state.attaching;
        let latest: ConversationView | undefined;
        let observation: Observation<ConversationView> | undefined;
        let wakeups: readonly WaitingWakeup[] = [];
        let current: SessionShown = NOT_MADE;
        const shownFrom = (): SessionShown =>
          latest === undefined
            ? NOT_MADE
            : { made: true, window: windowOf(latest), status: statusOf(latest, defaults.model, wakeups) };

        // The engine's view changes with every commit it shows, partial ones included: what clients see is worked out
        // once for all the changes of one turn of the event loop, outside the engine's commit, and from the value the
        // attachment gave.
        const publish = (): void => {
          state.scheduled = false;
          if (!state.ready || detached()) return;
          const next = shownFrom();
          const ops = diffRevisions(current, next);
          if (ops.length === 0) return;
          current = next;
          observer.advance({ kind: "value", value: next, ops, retired: false }, context);
        };
        const schedule = (): void => {
          if (state.scheduled || detached()) return;
          state.scheduled = true;
          queueMicrotask(publish);
        };

        // Until the agent makes the session there is nothing to follow but its making. Once it has, the wake-ups the
        // session waits on are read again after each commit that changes one of them, and a reading that a later one
        // overtook is dropped.
        let stopWaiting = (): void => undefined;
        let stopWakeups = (): void => undefined;
        let readings = 0;
        const failed = (error: unknown): void => {
          if (detached()) return;
          state.detached = true;
          stopWaiting();
          stopWakeups();
          observation?.detach();
          observer.end({ kind: "failed", error });
        };
        const readWakeups = async (conversationId: ConversationId): Promise<void> => {
          const reading = (readings += 1);
          const found = await waitingWakeups(harness, conversationId, context);
          if (reading === readings) wakeups = found;
        };

        const attach = async (conversationId: number): Promise<void> => {
          state.attaching = true;
          const id = conversationId as ConversationId;
          stopWakeups = onCommits(
            (publication) => touchesWakeups(publication, id),
            () => {
              readWakeups(id).then(schedule, failed);
            },
          );
          let made: Observation<ConversationView>;
          try {
            await readWakeups(id);
            made = await harness.observeConversation(
              id,
              {
                advance(call) {
                  if (call.kind !== "value") return;
                  latest = call.value;
                  schedule();
                },
                end(end) {
                  if (detached()) return;
                  state.detached = true;
                  stopWaiting();
                  stopWakeups();
                  observer.end(end);
                },
              },
              context,
            );
          } catch (error) {
            stopWakeups();
            throw error;
          }
          if (detached()) {
            made.detach();
            stopWakeups();
            return;
          }
          observation = made;
          // A change can arrive before the observation does, and is newer than its value.
          latest ??= made.value;
        };

        const lookAgain = async (): Promise<void> => {
          if (attaching() || detached()) return;
          const session = await recordOf(address);
          if (session === undefined || attaching() || detached()) return;
          stopWaiting();
          await attach(session.conversationId);
          schedule();
        };
        stopWaiting = onCommits(changesSessions, () => {
          lookAgain().catch(failed);
        });
        const session = await recordOf(address);
        if (session !== undefined) {
          stopWaiting();
          await attach(session.conversationId);
        }
        current = shownFrom();
        state.ready = true;
        shownNow.add(schedule);
        // What changed while it attached goes out after the value it attaches with.
        schedule();
        return {
          value: current,
          detach() {
            state.detached = true;
            stopWaiting();
            stopWakeups();
            observation?.detach();
            shownNow.delete(schedule);
          },
        };
      };
    },

    async read(address, before, limit, at) {
      const conversation = await conversationOf(address, at);
      // One more than asked for, newest first: the oldest of them, when there is one, is the entry just before the page.
      const wanted = limit + 1;
      const newestFirst: EntryRecord[] = [];
      let cursor;
      do {
        const page = await conversation.entries({ maxEntryId: before as EntryId }, wanted - newestFirst.length, cursor, at);
        newestFirst.push(...page.items);
        cursor = page.next;
      } while (cursor !== undefined && newestFirst.length < wanted);
      const entries = newestFirst.slice(0, limit).reverse();
      const earlier = newestFirst[limit]?.id ?? null;
      // The results of the page's last tool calls follow it.
      const unfinished = unfinishedCalls(entries);
      const newest = entries.at(-1);
      const later =
        unfinished === 0 || newest === undefined
          ? []
          : (await conversation.entries({ minEntryId: (newest.id + 1) as EntryId, order: "ascending" }, unfinished + SLACK, undefined, at)).items;
      return pageOf(entries, earlier, later);
    },

    async steer(address, text, request, at) {
      const conversation = await conversationOf(address, at);
      const submission = await conversation.submit({ type: "input", content: text, whenBusy: "steer", requestId: request }, at);
      return { submission: submission.id };
    },

    async wait(address, submission, at) {
      return waitForSettlement(harness, await conversationOf(address, at), submission, at);
    },

    async stop(address, at) {
      await stopWork(harness, await conversationOf(address, at), at);
    },

    models: () => listModels(models, defaults.model),

    async applyDefaults() {
      const change = agentChange(defaults);
      await harness.commit(async (tx) => {
        const sessions = (await tx.doc(SessionsDoc)).sessions;
        for (const session of Object.values(sessions)) {
          await configure(tx, session.conversationId as ConversationId, change);
        }
      }, context);
      for (const refresh of shownNow) refresh();
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

/** The sessions a turn is underway in: those with a live generation. */
async function sessionsAtWork(harness: Harness): Promise<Set<number>> {
  const { tasks } = await harness.inspect(context);
  return new Set(tasks.filter(({ record }) => record.kind === GenerationTask.definition.name).map(({ record }) => record.conversationId));
}
