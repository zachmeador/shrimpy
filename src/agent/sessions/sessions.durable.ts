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
  AgentModel,
  SessionPage,
  SessionPicture,
  SessionPlace,
  SessionStatus,
  SessionSummary,
  Settlement,
  Submitted,
} from "../../contracts/agent/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { type SessionDefaults, type SessionRecord, SessionsDoc } from "../records/durable.ts";
import { listModels } from "./models.durable.ts";
import { stopWork } from "./service.durable.ts";
import { pageOf, type SessionExtras, statusOf, type TakesPictures, unfinishedCalls, windowOf } from "./session-view.durable.ts";
import { waitForSettlement } from "./settlement.durable.ts";

const context = BACKGROUND_CONTEXT;

const SLACK = 8;

export type SessionShown = { made: boolean; window: SessionPage; status: SessionStatus | null };

const NOT_MADE: SessionShown = { made: false, window: { items: [], before: null }, status: null };

export type HomeModel = { readonly model: ModelRef; readonly fromHome: boolean };

export const noSessionYet = (address: string): string => `This agent has no session for ${address} yet.`;

const noSuchImage = (address: string, entry: number, index: number): string =>
  `The session behind ${address} has no image ${String(index)} in entry ${String(entry)}.`;

export function shownOf(view: ConversationView | null, extras: SessionExtras, home: ModelRef, takesPictures: TakesPictures): SessionShown {
  return view === null ? NOT_MADE : { made: true, window: windowOf(view, takesPictures), status: statusOf(view, home, extras) };
}

/** The agent's sessions, each sitting behind one real thread and addressed by its thread ID. */
export interface Sessions {
  list(): Promise<SessionSummary[]>;
  readonly listed: FollowAttach<SessionSummary[]>;
  view(address: string): FollowAttach<ConversationView | null>;
  readonly homeModel: FollowAttach<HomeModel>;
  read(address: string, before: number, limit: number, context: Context): Promise<SessionPage>;
  /** The image at `index` among those of an entry of a session, as the model was shown it. */
  image(address: string, entry: number, index: number, context: Context): Promise<SessionPicture>;
  /** Whether a model takes pictures, as the agent's model runtime lists it: one it doesn't list is taken to. */
  readonly takesPictures: TakesPictures;
  steer(address: string, text: string, request: string, context: Context): Promise<Submitted>;
  wait(address: string, submission: number, context: Context): Promise<Settlement>;
  stop(address: string, context: Context): Promise<void>;
  models(): Promise<AgentModel[]>;
  readonly defaults: SessionDefaults;
  fromHome(): boolean;
  applyDefaults(): Promise<void>;
  followModel(home: HomeModel): Promise<void>;
}

function changesList(publication: CommitPublication): boolean {
  return publication.changes.some(
    (change) =>
      (change.type === "document" && change.record.kind === SessionsDoc.definition.kind) ||
      (change.type === "task" && change.value.kind === GenerationTask.definition.name),
  );
}

function changesSessions(publication: CommitPublication): boolean {
  return publication.changes.some((change) => change.type === "document" && change.record.kind === SessionsDoc.definition.kind);
}

export function createSessions(harness: Harness, start: SessionDefaults, models: Models, fromHome = true): Sessions {
  const takesPictures: TakesPictures = (provider, id) => models.getModel(provider, id)?.input.includes("image") ?? true;
  let homeModel: HomeModel = { model: start.model, fromHome };
  const defaults: SessionDefaults = {
    get model() {
      return homeModel.model;
    },
    cwd: start.cwd,
  };
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
    if (conversation === undefined) refuse(noSessionYet(address));
    return conversation;
  };
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
        threadId: address,
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
        const value = observed.value as unknown as JsonValue;
        observer.advance({ kind: "value", value, ops: [["r", value]], retired: false }, context);
        for (const call of early) observer.advance(call, context);
      };
      const failed = (error: unknown): void => end({ kind: "failed", error });
      const stopWaiting = onCommits(changesSessions, () => {
        attach().catch(failed);
      });
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

    homeModel: follow({
      read: () => homeModel,
      watch(changed) {
        homeChanged.add(changed);
        return () => homeChanged.delete(changed);
      },
    }),

    async read(address, before, limit, at) {
      const conversation = await conversationOf(address, at);
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
      const unfinished = unfinishedCalls(entries);
      const newest = entries.at(-1);
      const later =
        unfinished === 0 || newest === undefined
          ? []
          : (await conversation.entries({ minEntryId: (newest.id + 1) as EntryId, order: "ascending" }, unfinished + SLACK, undefined, at)).items;
      return pageOf(entries, earlier, later, takesPictures);
    },

    async image(address, entry, index, at) {
      const conversation = await conversationOf(address, at);
      const [found] = (await conversation.entries({ minEntryId: entry as EntryId, maxEntryId: entry as EntryId }, 1, undefined, at)).items;
      const content = found?.model?.[0]?.content;
      const image = Array.isArray(content) ? content.filter((block) => block.type === "image")[index] : undefined;
      if (image?.type !== "image") refuse(noSuchImage(address, entry, index));
      return { mediaType: image.mimeType, data: Uint8Array.from(Buffer.from(image.data, "base64")) };
    },

    takesPictures,

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

    models: () => listModels(models),

    defaults,

    fromHome: () => homeModel.fromHome,

    applyDefaults,

    async followModel(home) {
      const before = homeModel;
      homeModel = home;
      if (home.model.provider !== before.model.provider || home.model.modelId !== before.model.modelId) {
        try {
          await applyDefaults();
        } catch (error) {
          homeModel = before;
          throw error;
        }
      }
      for (const changed of homeChanged) changed();
    },
  };
}

function placeSeen(session: SessionRecord): SessionPlace | null {
  const { place } = session;
  if (place === undefined) return null;
  const thread = { name: place.thread.name };
  if (place.kind === "dm") return { kind: "dm", with: { name: place.with.name, kind: place.with.kind }, thread };
  return { kind: "room", room: place.room, thread };
}

async function sessionsAtWork(harness: Harness): Promise<Set<number>> {
  const { tasks } = await harness.inspect(context);
  return new Set(tasks.filter(({ record }) => record.kind === GenerationTask.definition.name).map(({ record }) => record.conversationId));
}
