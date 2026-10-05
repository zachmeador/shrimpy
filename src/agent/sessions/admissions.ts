import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId, Harness } from "@earendil-works/pi-durable";
import type { Admissions } from "../chat/index.ts";
import type { SessionDefaults } from "./defaults.ts";
import { FeedDoc, SessionsDoc } from "./documents.ts";
import { openSession } from "./open-session.ts";
import { stopWork } from "./service.ts";
import { takeUp } from "./take-up.ts";
import type { TurnTask } from "./turn-task.ts";

const context = BACKGROUND_CONTEXT;

/**
 * Chat's view of the agent's records, over the engine. Each thread has one
 * session, made when the first event in it is taken up, in the same commit
 * that creates the task that follows the event and moves the feed's cursor
 * past it. Nothing is lost between an event being read and being taken up, and
 * nothing is taken up twice.
 */
export function createAdmissions(harness: Harness, defaults: SessionDefaults, turn: TurnTask): Admissions {
  return {
    async cursor() {
      return (await harness.snapshot(FeedDoc, context))?.cursor ?? undefined;
    },

    async setCursor(seq) {
      await harness.commit(async (tx) => {
        (await tx.doc(FeedDoc)).cursor = seq;
      }, context);
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
      if (conversation !== undefined) await stopWork(harness, conversation, context);
    },

    admit(draft, position = draft.event.seq) {
      return harness.commit(async (tx) => {
        (await tx.doc(FeedDoc)).cursor = position;
        const session = await openSession(tx, defaults, { threadId: draft.threadId, channelId: draft.channelId });
        // An event in a room is the newest thing the agent has looked at in its thread.
        if (draft.backlog !== undefined && session.channelId !== null) {
          session.looked = Math.max(session.looked ?? 0, draft.event.seq);
        }
        await takeUp(tx, turn, session.conversationId as ConversationId, draft);
      }, context);
    },
  };
}
