import type { Context, JsonValue } from "@earendil-works/chord";
import {
  type ConversationId,
  type Cursor,
  defineExtension,
  defineTask,
  type Extension,
  type Harness,
  type TaskRecord,
  type ToolExecutionApi,
  type Tx,
} from "@earendil-works/pi-durable";
import { localTime } from "../../lib/time/index.ts";
import type { Breadcrumb, Question } from "../inputs/index.ts";
import { QuestionsDoc } from "../records/durable.ts";
import type { TurnTask } from "../turns/durable.ts";
import { closeQuestion, forgetQuestion } from "./close.durable.ts";
import type { Look } from "./look.ts";

/** The name of the task that sleeps until the time to wait for an answer is up, and then closes the question if it is still open. */
const QUESTION_TASK = "shrimpy.question";

/** How many questions a session may have open at once. */
export const MAX_OPEN = 5;

/** The questions the agent asks, as the tool that asks one sees them. */
export interface Questions {
  /**
   * The question the tool call in `api` asked, if it asked one, found whether it
   * is still open or has closed, so that a call that runs again after a crash
   * finds the question its first run kept and asks no second one.
   */
  find(api: ToolExecutionApi, id: string, context: Context): Promise<Question | undefined>;
  /** How many questions the session at `address` has open. */
  count(api: ToolExecutionApi, address: string, context: Context): Promise<number>;
  /** Keep a question that was just posted, and start the task that closes it when its time is up. */
  keep(api: ToolExecutionApi, question: Question, context: Context): Promise<void>;
}

export interface QuestionsOptions {
  /** Told of a question that came to its time and could not be closed. */
  onError(error: Error): void;
  /** The home's breadcrumbs, read before the commit that takes a result up, which reads no files. */
  breadcrumbs(): Promise<readonly Breadcrumb[]>;
  /** Looks at chat for what the other agent left on a question, once its time is up. */
  looking: Look;
}

/**
 * The questions the agent asks other agents. Each open question is in the
 * agent's records, and has a background task of the session that asked, which
 * sleeps on the engine's timer until the time to wait is up. Then it looks at the
 * question's message in chat once, since the other agent's receipt may be there
 * that the agent's feed has not brought yet, and closes the question, if it is
 * still open: with what the receipt says, if the other agent left one, and
 * otherwise by telling the session that the other agent has not answered. Not
 * having been able to look is not a reason to say so: the look waits for chat.
 * Closing is one commit, so a question closes once: a receipt in chat's feed
 * closes it in the commit that moves the agent's place there, and whichever comes
 * first leaves nothing for the other. A question whose time was up while the agent
 * was down is closed when it starts again. Sleeping is not work, so the session is
 * not working until the turn a result starts is. Ending the task of an open
 * question, as a stop does, closes it and tells nobody.
 */
export function createQuestions(turn: TurnTask, options: QuestionsOptions): Questions & { extension: Extension } {
  const task = defineTask<Question, { phase: "sleep" }, null>({
    name: QUESTION_TASK,
    version: 1,
    initial: () => ({ phase: "sleep" }),
    phases: {
      sleep: async (waiting, runtime, context) => {
        const question = waiting.input;
        await runtime.sleep(question.due, context);
        try {
          const looked = await options.looking.look(question, runtime.signal);
          const crumbs = await options.breadcrumbs();
          await runtime.commit(async (tx) => {
            await closeQuestion(tx, turn, question.id, looked?.result ?? { kind: "unanswered" }, crumbs, looked?.through);
            return { status: "terminal", outcome: { status: "completed", result: null } };
          }, context);
        } catch (error) {
          // The engine is closing, or the task was aborted: the engine ends the phase and carries on from the checkpoint.
          if (runtime.signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          // The question is closed all the same, since nothing else would: it has no time left, and would keep a place.
          await runtime.commit(async (tx) => {
            await forgetQuestion(tx, question.id);
            return { status: "terminal", outcome: { status: "failed", error: { message } } };
          }, context);
          options.onError(new Error(`The question asked of ${question.of.name} at ${localTime(question.askedAt)} could not be closed: ${message}`));
        }
      },
    },

    abort: async (waiting, runtime, context) => {
      await runtime.commit(async (tx) => {
        await forgetQuestion(tx, waiting.input.id);
        return { status: "terminal", outcome: { status: "aborted" } };
      }, context);
    },
  });

  return {
    extension: defineExtension({ name: "questions", tasks: [task] }),

    async find(api, id, context) {
      return api.commit(async (tx) => {
        for (const record of await sleepers(tx, api.conversationId)) {
          const question = record.input as Question;
          if (question.id === id) return question;
        }
        return undefined;
      }, context);
    },

    async count(api, address, context) {
      const kept = (await api.snapshot(QuestionsDoc, context))?.open ?? {};
      return Object.values(kept).filter((question) => question.session === address && question.through === undefined).length;
    },

    async keep(api, question, context) {
      await api.commit(async (tx) => {
        // The session's, not the tool call's: a call that finishes does not end what it asked.
        const sleeping = await tx.createTask(task, question, { ownership: { kind: "conversation" }, background: true });
        (await tx.doc(QuestionsDoc)).open[question.id] = { ...question, task: Number(sleeping) };
      }, context);
    },
  };
}

/**
 * Close the questions a session has open and tell nobody, and wait until the
 * tasks that waited for them have ended. The other agent's answer, if it comes, is
 * an ordinary message in the question's thread.
 */
export async function closeQuestions(harness: Harness, conversationId: ConversationId, context: Context): Promise<void> {
  const { tasks } = await harness.inspect(context);
  const waiting = tasks
    .filter(({ record }) => record.kind === QUESTION_TASK && record.conversationId === conversationId && !record.abortRequested)
    .map(({ record }) => record.id);
  for (const id of waiting) await harness.abortTask(id, context);
  for (const id of waiting) await harness.waitForTask(id, context);
}

/** Every task that closes a question of one session, ended or not. */
async function sleepers(tx: Tx, conversationId: ConversationId): Promise<TaskRecord<JsonValue, JsonValue, JsonValue>[]> {
  const found: TaskRecord<JsonValue, JsonValue, JsonValue>[] = [];
  let cursor: Cursor | undefined;
  do {
    const page = await tx.scanTasks({ conversationId, kind: QUESTION_TASK }, 100, cursor);
    found.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return found;
}
