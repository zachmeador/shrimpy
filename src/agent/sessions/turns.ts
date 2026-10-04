import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, type Harness } from "@earendil-works/pi-durable";
import type { Outstanding, Snapshot, Turns } from "../intake/index.ts";
import { FeedDoc, OutboxDoc, plain, ThreadsDoc } from "./documents.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { turnOf } from "./turn.ts";

const context = BACKGROUND_CONTEXT;

/** The input a message becomes is named for the message, so handing the same message over twice is one input. */
const requestIdOf = (messageId: string): string => `chat:${messageId}`;

/**
 * Intake's view of the agent's sessions and records, over the engine. Each
 * thread has one session, made when the first message in it is taken, in the
 * same commit that records the message. The record, the hand-over and the
 * settling are separate commits, in that order, and each can be repeated.
 */
export function createTurns(harness: Harness, defaults: SessionDefaults): Turns {
  return {
    async cursor() {
      return (await harness.snapshot(FeedDoc, context))?.cursor ?? undefined;
    },

    async setCursor(seq) {
      await harness.commit(async (tx) => {
        (await tx.doc(FeedDoc)).cursor = seq;
      }, context);
    },

    record(draft) {
      const id = draft.message.id;
      return harness.commit(async (tx) => {
        const threads = (await tx.doc(ThreadsDoc)).sessions;
        const outbox = (await tx.doc(OutboxDoc)).entries;
        if (Object.hasOwn(outbox, id)) return plain(outbox[id]);

        let session = Object.hasOwn(threads, draft.threadId) ? threads[draft.threadId] : undefined;
        if (session !== undefined) {
          // The record is only taken out once the receipt is left, so an input without one has been through all of it.
          const handed = await tx.submissionByRequest(session.conversationId as ConversationId, requestIdOf(id));
          if (handed !== undefined) return undefined;
        } else {
          const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
          await configure(tx, created.id, agentChange(defaults));
          threads[draft.threadId] = { conversationId: created.id, channelId: draft.channelId, unacted: [] };
          session = threads[draft.threadId];
        }
        const earlier = plain(session?.unacted ?? []);
        if (session !== undefined) session.unacted = [];
        const outstanding: Outstanding = { ...plain(draft), earlier };
        outbox[id] = outstanding;
        return plain(outstanding);
      }, context);
    },

    async start(outstanding, text) {
      const session = (await harness.snapshot(ThreadsDoc, context))?.sessions[outstanding.threadId];
      if (session === undefined) throw new Error(`The agent has no session for thread ${outstanding.threadId}.`);
      const conversation = await harness.conversation(session.conversationId as ConversationId, context);
      if (conversation === undefined) throw new Error(`The session for thread ${outstanding.threadId} is gone.`);
      const submission = await conversation.submit(
        { type: "input", content: text, whenBusy: "followUp", requestId: requestIdOf(outstanding.message.id) },
        context,
      );
      // An input that waits with nothing running ahead of it was left behind by a turn that failed, and nothing
      // would ever start it. That is only found here after a restart; it is taken back, as it would have been then.
      if (await waitsBehindNothing(harness, conversation.id, submission.id)) {
        await harness.abortSubmission(submission.id, context, conversation.id);
      }
      return turnOf(conversation, submission);
    },

    async withdraw(outstanding) {
      const session = (await harness.snapshot(ThreadsDoc, context))?.sessions[outstanding.threadId];
      if (session === undefined) return;
      const conversationId = session.conversationId as ConversationId;
      const handed = await harness.commit(
        (tx) => tx.submissionByRequest(conversationId, requestIdOf(outstanding.message.id)),
        context,
      );
      // The engine only takes back an input that is still waiting, and says so for one that is not.
      if (handed !== undefined) await harness.abortSubmission(handed.id, context, conversationId);
    },

    async outstanding() {
      const entries = (await harness.snapshot(OutboxDoc, context))?.entries ?? {};
      return plain(Object.values(entries)).sort((a, b) => a.message.seq - b.message.seq);
    },

    settle(outstanding, outcome) {
      const id = outstanding.message.id;
      return harness.commit(async (tx) => {
        const outbox = (await tx.doc(OutboxDoc)).entries;
        // Already settled, by an earlier try whose acknowledgment was lost.
        if (!Object.hasOwn(outbox, id)) return;
        Reflect.deleteProperty(outbox, id);
        if (outcome.kind !== "skipped") return;
        const session = (await tx.doc(ThreadsDoc)).sessions[outstanding.threadId];
        if (session === undefined) return;
        session.unacted = inOrder([...plain(session.unacted), ...outstanding.earlier, outstanding.message]);
      }, context);
    },
  };
}

/** Whether an input is waiting in a session that has no input being worked on. */
async function waitsBehindNothing(harness: Harness, conversationId: ConversationId, submissionId: number): Promise<boolean> {
  const { submissions } = await harness.inspect(context);
  const inputs = submissions.filter((entry) => entry.conversationId === conversationId && entry.type === "input");
  const mine = inputs.find((entry) => entry.id === submissionId);
  return mine?.status === "queued" && !inputs.some((entry) => entry.status === "placed");
}

/** Messages by position in chat's order, each once. */
function inOrder(messages: Snapshot[]): Snapshot[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
