import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  AgentDoc,
  configure,
  type Conversation,
  type ConversationId,
  type Harness,
  type ModelRef,
  type TaskId,
  type Tx,
} from "@earendil-works/pi-durable";
import type { ModelId } from "../../contracts/agent/index.ts";
import type { Breadcrumb } from "../inputs/index.ts";
import { closeQuestion as closeInCommit, forgetPassed } from "../questions/durable.ts";
import { FeedDoc, learnPlace, openSession, QuestionsDoc, type SessionDefaults, SessionsDoc } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";
import type { Admissions } from "./admissions.ts";

const context = BACKGROUND_CONTEXT;

/**
 * How the work of a session is stopped. That is the sessions' to do, and they
 * are above this module, so whoever makes the admissions hands it in.
 */
export type StopWork = (harness: Harness, conversation: Conversation, context: Context) => Promise<void>;

/** What chat asks of the sessions, which are above it, so whoever makes the admissions hands it in. */
export interface FromSessions {
  /** Stop the work of a session. */
  stopWork: StopWork;
  /** Refuse a model the agent can't use now, saying which it can. */
  requireModel(model: ModelRef): Promise<void>;
}

/** A model as Shrimpy's own types write it. */
const idOf = (model: { provider: string; modelId: string }): ModelId => ({ provider: model.provider, id: model.modelId });

/**
 * Chat's view of the agent's records, over the engine. Each thread has one
 * session, made when the first event in it is taken up, in the same commit
 * that creates the task that follows the event and moves the feed's cursor
 * past it. Nothing is lost between an event being read and being taken up, and
 * nothing is taken up twice. The home's breadcrumbs are read before that commit,
 * which reads no files, and the ones that are new to the session go with the event.
 * The receipt that closes a question the agent asked is taken up the same way: the
 * question closes and its result becomes an input of the session that asked in the
 * commit that moves the cursor past the receipt. A command that chooses a thread's
 * model makes the thread's session too, if it has none, in the commit that gives it
 * the model.
 */
export function createAdmissions(
  harness: Harness,
  defaults: SessionDefaults,
  turn: TurnTask,
  acts: FromSessions,
  breadcrumbs: () => Promise<readonly Breadcrumb[]>,
): Admissions {
  /** The chat store the agent is reading, once it has said: each cursor it sets is kept with this ID. */
  let reading: string | undefined;
  /** Move the agent's place in the feed, and let go of the questions a look closed that the feed is now past. */
  const moveCursor = async (tx: Tx, seq: number): Promise<void> => {
    const feed = await tx.doc(FeedDoc);
    feed.cursor = seq;
    if (reading !== undefined) feed.store = reading;
    await forgetPassed(tx, seq);
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
          // Positions in the store that was lost mean nothing in the new one.
          await forgetPassed(tx, Number.POSITIVE_INFINITY);
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
      return known?.channelId === null ? undefined : known?.looked;
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
      // A model the agent can't use is refused before anything is written, so a thread is not given a session for it.
      if (model !== null) await acts.requireModel(wanted);
      return harness.commit(async (tx) => {
        const session = await openSession(tx, defaults, { threadId, channelId });
        const conversationId = session.conversationId as ConversationId;
        // A session that was just made starts with the home's model, so this is the model it ran on before.
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
        // An event in a room is the newest thing the agent has looked at in its thread.
        if (draft.backlog !== undefined && session.channelId !== null) {
          session.looked = Math.max(session.looked ?? 0, draft.event.seq);
        }
        await takeUp(tx, turn, session.conversationId as ConversationId, draft, crumbs);
      }, context);
    },

    async questions() {
      return Object.values((await harness.snapshot(QuestionsDoc, context))?.open ?? {});
    },

    async closeQuestion(id, result, position) {
      const crumbs = await breadcrumbs();
      const closed = await harness.commit(async (tx) => {
        await moveCursor(tx, position);
        return closeInCommit(tx, turn, id, result, crumbs);
      }, context);
      // The question has no time left to run out: its task has nothing to wait for.
      if (closed !== undefined) await harness.abortTask(closed.task as TaskId, context);
    },
  };
}
