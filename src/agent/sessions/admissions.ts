import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { Admissions, Snapshot, Wakeup } from "../intake/index.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { FeedDoc, plain, SessionsDoc } from "./documents.ts";
import { carrying, takeCancelled, takeEvents } from "./kept.ts";
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

    admit(draft, position = draft.event.seq) {
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
          threads[draft.threadId] = { conversationId, channelId: draft.channelId, unacted: [] };
        } else {
          conversationId = known.conversationId as ConversationId;
          earlier = takeEvents(known);
          cancelled = takeCancelled(known);
        }
        await followInput(tx, turn, conversationId, { ...plain(draft), earlier, ...carrying(cancelled) });
      }, context);
    },
  };
}
