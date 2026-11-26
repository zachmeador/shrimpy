import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import {
  AgentDoc,
  configure,
  type Conversation,
  type ConversationId,
  type Harness,
  type ModelRef,
  type Tx,
} from "@earendil-works/pi-durable";
import type { ModelId } from "../../contracts/agent/index.ts";
import type { Breadcrumb } from "../inputs/index.ts";
import { FeedDoc, learnPlace, openSession, type SessionDefaults, SessionsDoc, WatchesDoc } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";
import { settleWatch as settleInCommit } from "../watches/durable.ts";
import type { Admissions } from "./admissions.ts";

const context = BACKGROUND_CONTEXT;

export type StopWork = (harness: Harness, conversation: Conversation, context: Context) => Promise<void>;

export interface FromSessions {
  stopWork: StopWork;
  requireModel(model: ModelRef): Promise<void>;
}

const idOf = (model: { provider: string; modelId: string }): ModelId => ({ provider: model.provider, id: model.modelId });

export function createAdmissions(
  harness: Harness,
  defaults: SessionDefaults,
  turn: TurnTask,
  acts: FromSessions,
  breadcrumbs: () => Promise<readonly Breadcrumb[]>,
): Admissions {
  let reading: string | undefined;
  const moveCursor = async (tx: Tx, seq: number): Promise<void> => {
    const feed = await tx.doc(FeedDoc);
    feed.cursor = seq;
    if (reading !== undefined) feed.store = reading;
  };

  return {
    async cursor() {
      return (await harness.snapshot(FeedDoc, context))?.cursor ?? undefined;
    },

    async readingStore(store) {
      const feed = await harness.snapshot(FeedDoc, context);
      const lost = feed !== undefined && feed.cursor !== null && feed.store !== store;
      if (lost) {
        await harness.commit(async (tx) => {
          const kept = await tx.doc(FeedDoc);
          kept.cursor = 0;
          kept.store = store;
        }, context);
      }
      reading = store;
      return lost;
    },

    async setCursor(seq) {
      await harness.commit((tx) => moveCursor(tx, seq), context);
    },

    async looked(threadId) {
      const sessions = (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
      const known = Object.hasOwn(sessions, threadId) ? sessions[threadId] : undefined;
      return known?.looked;
    },

    async stopWork(threadId) {
      const sessions = (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
      const known = Object.hasOwn(sessions, threadId) ? sessions[threadId] : undefined;
      if (known === undefined) return;
      const conversation = await harness.conversation(known.conversationId as ConversationId, context);
      if (conversation !== undefined) await acts.stopWork(harness, conversation, context);
    },

    async modelOf(threadId) {
      const sessions = (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
      const known = Object.hasOwn(sessions, threadId) ? sessions[threadId] : undefined;
      const home = idOf(defaults.model);
      if (known === undefined) return { used: home, home };
      const own = (await harness.snapshot(AgentDoc, known.conversationId as ConversationId, context))?.model;
      return { used: own === undefined ? home : idOf(own), home };
    },

    async useModel({ threadId, channelId }, model) {
      const wanted: ModelRef = model === null ? defaults.model : { provider: model.provider, modelId: model.id };
      if (model !== null) await acts.requireModel(wanted);
      return harness.commit(async (tx) => {
        const session = await openSession(tx, defaults, { threadId, channelId });
        const conversationId = session.conversationId as ConversationId;
        const had = (await tx.doc(AgentDoc, conversationId)).model;
        const before = had === undefined ? idOf(defaults.model) : idOf(had);
        await configure(tx, conversationId, { model: wanted });
        return { before, now: idOf(wanted) };
      }, context);
    },

    async admit(draft, position = draft.event.seq) {
      const crumbs = await breadcrumbs();
      await harness.commit(async (tx) => {
        await moveCursor(tx, position);
        const session = await openSession(tx, defaults, { threadId: draft.threadId, channelId: draft.channelId });
        if (draft.place !== undefined) learnPlace(session, draft.place);
        if (draft.backlog !== undefined) {
          session.looked = Math.max(session.looked ?? 0, draft.event.seq);
        }
        await takeUp(tx, turn, session.conversationId as ConversationId, draft, crumbs);
      }, context);
    },

    async watches() {
      return Object.values((await harness.snapshot(WatchesDoc, context))?.open ?? {});
    },

    async settleWatch(id, result, at, position) {
      const crumbs = await breadcrumbs();
      await harness.commit(async (tx) => {
        await moveCursor(tx, position);
        await settleInCommit(tx, turn, id, result, at, crumbs);
      }, context);
    },
  };
}
