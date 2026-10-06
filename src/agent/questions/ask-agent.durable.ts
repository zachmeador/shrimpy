import type { Context } from "@earendil-works/chord";
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool, type Extension, type ToolExecutionApi, type ToolExecutionResult } from "@earendil-works/pi-durable";
import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { LiveChat } from "../links/index.ts";
import { addressOfPlace, placeOfSession } from "../records/durable.ts";
import { readTo, readWithin, SHORTEST_WITHIN, startOf } from "./args.ts";
import { agentNamed, dmThreadWith } from "./lookup.ts";
import { MAX_OPEN, type Questions } from "./questions.durable.ts";
import * as words from "./words.ts";

/** What the tool that asks another agent is handed. */
export interface AskToolsOptions {
  /** Where the agent's open questions are kept. */
  questions: Questions;
  /** What the agent's records are called. The request ID of every question carries it. */
  recordsId: string;
  /**
   * The connection to chat that is up right now, if one is. The tool uses the
   * agent's own connection and never opens another, and never waits for one:
   * with none up it says chat is unreachable. Who the agent is comes with it.
   */
  chat(): LiveChat | undefined;
  /** The connection to the gateway that is up right now, if one is. The tool looks the name up in the roster over it. */
  gateway(): GatewayConnection | undefined;
  /** The shortest wait for an answer a question may be given, in milliseconds. A minute, if not given. Tests shorten it. */
  shortestWaitMs?: number;
}

/** A tool's answer: just these words. */
const answer = (text: string): ToolExecutionResult => ({ content: [{ type: "text", text }] });

/** A tool's answer when it did not do what was asked: just these words, marked as an error. */
const failure = (text: string): ToolExecutionResult => ({ isError: true, content: [{ type: "text", text }] });

/**
 * `ask_agent`: post a question in the agent's DM with another agent, and answer
 * at once, so the model can end its turn. What comes back is an input of the same
 * session, later. The question is named for the call: a call that runs again
 * after a crash finds the question its first run kept, and the request ID makes
 * the one post it made the same post. A run that loses chat after a first run
 * that was about to post can't say whether the question was posted, and says so,
 * as it does when the connection ends while it posts. Calls of one round run
 * one after another, so the count of open questions read before a question is
 * posted is the count when it is kept.
 */
export function askAgent(options: AskToolsOptions) {
  return defineTool({
    name: "ask_agent",
    description: words.ASK_DESCRIPTION,
    parameters: Type.Object({
      to: Type.String({ description: words.ASK_TO }),
      text: Type.String({ description: words.ASK_TEXT }),
      within: Type.Optional(Type.String({ description: words.ASK_WITHIN })),
    }),
    replay: "safe",
    executionMode: "sequential",
    async execute({ to, text, within }, api, context) {
      const question = text.trim();
      if (question === "") return failure(words.TEXT_EMPTY);
      const name = readTo(to);
      if (name === undefined) return failure(words.BAD_TO);
      const wait = readWithin(within, options.shortestWaitMs ?? SHORTEST_WITHIN);
      if ("problem" in wait) return failure(wait.problem);

      const id = `ask_${String(api.taskId)}`;
      const place = await placeOfSession(api, api.conversationId, context);
      if (place === undefined) throw new Error("The session is not one the agent keeps, so there is nowhere for the answer to come to.");
      const session = addressOfPlace(place);

      const kept = await options.questions.find(api, id, context);
      if (kept !== undefined) return answer(words.asked(kept.of.name, kept.due));

      // A call that ran before and left its time was about to post the question, and may have.
      const earlier = await api.memo<number>("askedAt", context);
      const live = options.chat();
      if (live === undefined) return failure(earlier === undefined ? words.UNREACHABLE : words.uncertain(name));
      const signal = callSignal(live, context);
      let posting = false;
      try {
        const found = await agentNamed(options.gateway(), name, live.self);
        if ("problem" in found) return failure(found.problem);
        const open = await options.questions.count(api, session, context);
        if (open >= MAX_OPEN) return failure(words.tooMany(open));
        const dm = await dmThreadWith(live.chat, found.agent, signal);
        if ("problem" in dm) return failure(dm.problem);

        // Fixed for the call, so that a run after a crash gives up at the same time as the first.
        const askedAt = earlier ?? (await api.memo("askedAt", Date.now(), context));
        posting = true;
        const posted = await live.chat.post(dm.threadId, question, requestId(options.recordsId, api), signal);
        posting = false;
        const due = askedAt + wait.ms;
        await options.questions.keep(
          api,
          {
            id,
            session,
            of: { id: found.agent.id, name: found.agent.name },
            askedAt,
            due,
            start: startOf(question),
            dm: dm.threadId,
            message: posted.id,
            event: posted.event,
            seq: posted.seq,
          },
          context,
        );
        return answer(words.asked(found.agent.name, due));
      } catch (error) {
        const why = chatFailure(error, live, context);
        if ("refused" in why) return failure(words.refused(why.refused));
        // A post that was out when the connection ended may have reached chat, and so may one an earlier run made.
        return failure(posting || earlier !== undefined ? words.uncertain(name) : words.UNREACHABLE);
      }
    },
  });
}

/** The tool that asks another agent, as an extension to install in the engine's registry. */
export function askTools(options: AskToolsOptions): Extension {
  return defineExtension({ name: "question-tools", tools: [askAgent(options)] });
}

/**
 * What names the one post of a call. Chat posts a request ID once, so a call that
 * runs again posts nothing twice. The call's own ID is the model's and may repeat
 * in another session, so the engine's number for the call goes with it, and the
 * engine numbers its tasks again in a new database, so what the agent's records
 * are called goes with both.
 */
function requestId(recordsId: string, api: ToolExecutionApi): string {
  const call = api.callId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
  return `ask-${recordsId}-${String(api.taskId)}-${call}`;
}

/** The signal that ends a call to chat: the connection being lost, or the turn being stopped. */
function callSignal(live: LiveChat, context: Context): AbortSignal {
  return context.abortSignal === undefined ? live.lost : AbortSignal.any([live.lost, context.abortSignal]);
}

/**
 * Sort out why a call to chat failed: chat answered and said no, for a reason, or
 * the connection ended. A failure that is not about chat, such as the turn being
 * stopped or a mistake in the code, is thrown again for the engine to deal with.
 */
function chatFailure(error: unknown, live: LiveChat, context: Context): { refused: string } | { lost: true } {
  if (context.abortSignal?.aborted === true) throw error;
  if (live.lost.aborted || isDisconnected(error)) return { lost: true };
  if (isRefusal(error)) return { refused: error.message };
  throw error;
}
