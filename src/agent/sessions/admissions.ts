import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { Admissions, Snapshot, Wakeup } from "../intake/index.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { FeedDoc, plain, SessionsDoc } from "./documents.ts";
import { carrying, takeCancelled, takeEvents } from "./kept.ts";
import { stopWork } from "./service.ts";
import { followInput, type TurnTask } from "./turn-task.ts";

const context = BACKGROUND_CONTEXT;

/**
 * Intake's view of the agent's records, over the engine. Each thread has one
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
      // An event in a room is the newest thing the agent has looked at in its thread.
      const looking = draft.backlog === undefined ? {} : { looked: draft.event.seq };
      return harness.commit(async (tx) => {
        (await tx.doc(FeedDoc)).cursor = position;
        const threads = (await tx.doc(SessionsDoc)).sessions;
        const known = Object.hasOwn(threads, draft.threadId) ? threads[draft.threadId] : undefined;
        let conversationId: ConversationId;
        let earlier: Snapshot[] = [];
        let cancelled: Wakeup[] = [];
        if (known === undefined) {
          conversationId = (await tx.createConversation({ ownership: { kind: "ownerless" } })).id;
          await configure(tx, conversationId, agentChange(defaults));
          threads[draft.threadId] = { conversationId, channelId: draft.channelId, unacted: [], ...looking };
        } else {
          conversationId = known.conversationId as ConversationId;
          earlier = takeEvents(known);
          cancelled = takeCancelled(known);
          if (known.channelId !== null && looking.looked !== undefined) known.looked = Math.max(known.looked ?? 0, looking.looked);
        }
        await followInput(tx, turn, conversationId, { ...plain(draft), earlier, ...carrying(cancelled) });
      }, context);
    },
  };
}
