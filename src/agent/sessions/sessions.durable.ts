import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
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
  type ModelRef,
  type Observation,
  type WatchCall,
  type WatchEnd,
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
import type { Wakeup } from "../inputs/index.ts";
import { type SessionDefaults, type SessionRecord, SessionsDoc } from "../records/durable.ts";
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

/** A session as clients see it, from the engine's view of it, or null before it is made, the wake-ups it waits on and the home's model. */
export function shownOf(view: ConversationView | null, wakeups: readonly WaitingWakeup[], home: ModelRef): SessionShown {
  return view === null ? NOT_MADE : { made: true, window: windowOf(view), status: statusOf(view, home, wakeups) };
}

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
   * The engine's view of the session with this address, kept live, a partial
   * answer included, as Chord's `self.follow` takes it: null until the agent makes
   * the session, and followed from the moment it does.
   */
  view(address: string): FollowAttach<ConversationView | null>;
  /** The wake-ups the session with this address waits on, the soonest first, kept live. */
  wakeups(address: string): FollowAttach<Wakeup[]>;
  /** The model the sessions follow by default, which is the home's, kept live. */
  readonly homeModel: FollowAttach<ModelRef>;
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
  /** What a session is made with: the home's model as it is now, and the directory its tools work in. */
  readonly defaults: SessionDefaults;
  /** Make every session follow the home's model and working directory, as a new session does from the start, whatever model it was given. */
  applyDefaults(): Promise<void>;
  /** The home names `model` now: every session follows it from its next request, and if that fails, they keep the one they followed. */
  followModel(model: ModelRef): Promise<void>;
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

export function createSessions(harness: Harness, start: SessionDefaults, models: Models): Sessions {
  let homeModel = start.model;
  const defaults: SessionDefaults = {
    get model() {
      return homeModel;
    },
    cwd: start.cwd,
  };
  /** Told after the home's model changes. */
  const homeChanged = new Set<() => void>();
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

  const applyDefaults = async (): Promise<void> => {
    await harness.commit(async (tx) => {
      const sessions = (await tx.doc(SessionsDoc)).sessions;
      for (const session of Object.values(sessions)) {
        await configure(tx, session.conversationId as ConversationId, defaults);
      }
    }, context);
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

    view: (address) => async (observer, at) => {
      const made = await recordOf(address);
      if (made !== undefined) return harness.observeConversation(made.conversationId as ConversationId, observer, at);
      // Until the agent makes the session there is nothing to follow but its making. What the engine says before its
      // observation arrives is newer than the observation's value, so it goes out after it.
      // Read through functions: each changes while the session is looked for or attached to.
      const state = { over: false, attaching: false };
      const over = (): boolean => state.over;
      const attaching = (): boolean => state.attaching;
      let observation: Observation<ConversationView> | undefined;
      const end = (how: WatchEnd): void => {
        if (over()) return;
        state.over = true;
        stopWaiting();
        observation?.detach();
        observer.end(how);
      };
      const attach = async (): Promise<void> => {
        if (attaching() || over()) return;
        const session = await recordOf(address);
        if (session === undefined || attaching() || over()) return;
        state.attaching = true;
        stopWaiting();
        const early: WatchCall<ConversationView>[] = [];
        const forwarding: { now: boolean } = { now: false };
        const observed = await harness.observeConversation(
          session.conversationId as ConversationId,
          {
            advance(call, called) {
              if (forwarding.now) observer.advance(call, called);
              else early.push(call);
            },
            end,
          },
          context,
        );
        if (over()) return observed.detach();
        observation = observed;
        forwarding.now = true;
        // The engine's view is JSON, though its type marks its lists as read-only.
        const value = observed.value as unknown as JsonValue;
        observer.advance({ kind: "value", value, ops: [["r", value]], retired: false }, context);
        for (const call of early) observer.advance(call, context);
      };
      const failed = (error: unknown): void => end({ kind: "failed", error });
      const stopWaiting = onCommits(changesSessions, () => {
        attach().catch(failed);
      });
      // A session made between the first look and the watch is found now.
      attach().catch(failed);
      return {
        value: null,
        detach() {
          state.over = true;
          stopWaiting();
          observation?.detach();
        },
      };
    },

    wakeups(address) {
      /** The session's ID in the engine, once it is made. */
      let made: ConversationId | undefined;
      return follow({
        async read() {
          made ??= (await recordOf(address))?.conversationId as ConversationId | undefined;
          return made === undefined ? [] : waitingWakeups(harness, made, context);
        },
        watch: (changed) =>
          onCommits((publication) => (made === undefined ? changesSessions(publication) : touchesWakeups(publication, made)), changed),
      });
    },

    homeModel: follow({
      read: () => defaults.model,
      watch(changed) {
        homeChanged.add(changed);
        return () => homeChanged.delete(changed);
      },
    }),

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

    defaults,

    applyDefaults,

    async followModel(model) {
      const before = homeModel;
      homeModel = model;
      try {
        await applyDefaults();
      } catch (error) {
        homeModel = before;
        throw error;
      }
      for (const changed of homeChanged) changed();
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
