import { obj, opt, str } from "@earendil-works/pi-schema";
import { defineExtension, defineTool, type Extension, type ToolExecutionApi } from "@earendil-works/pi-durable";
import type { RosterEntry } from "../../contracts/gateway/index.ts";
import { answer, failure } from "../host/durable.ts";
import type { Member } from "../../contracts/chat/index.ts";
import { callSignal, type ChatCalls, chatFailure, type LiveChat, nameOnRoster } from "../links/index.ts";
import { addressOfPlace, placeOfSession } from "../records/durable.ts";
import { readTo, readWithin, SHORTEST_WITHIN, startOf } from "./args.ts";
import { MAX_OPEN, type Questions } from "./questions.durable.ts";
import * as words from "./words.ts";

/** What the tool that asks another agent is handed. */
export interface AskToolsOptions {
  /** Where the agent's open questions are kept. */
  questions: Questions;
  /** What the agent's records are called. The request ID of every question carries it. */
  recordsId: string;
  /**
   * Chat as it is up right now, if it is. The tool never waits for it: with
   * none up it says chat is unreachable. Who the agent is comes with it.
   */
  chat(): LiveChat | undefined;
  /** Everyone on the roster, as the agent holds it, or undefined while the agent has not heard it. The tool looks the name up in it. */
  roster(): readonly RosterEntry[] | undefined;
  /** The shortest wait for an answer a question may be given, in milliseconds. A minute, if not given. Tests shorten it. */
  shortestWaitMs?: number;
}

/**
 * `ask_agent`: make a thread of its own for a question in the agent's DM with
 * another agent, post the question in it, and answer at once, so the model can end
 * its turn. What comes back is an input of the same session, later. The question
 * is named for the call: a call that runs again after a crash finds the question
 * its first run kept, and the thread its first run made, which it keeps as soon
 * as chat has made it, and the request ID makes the one post it made the same
 * post. A run that loses chat after a first run that was about to make the thread
 * can't say whether the question was posted, and says so, as it does when the
 * connection ends while it posts. Calls of one round run one after another, so the
 * count of open questions read before a question is posted is the count when it is
 * kept.
 */
function askAgent(options: AskToolsOptions) {
  return defineTool({
    name: "ask_agent",
    description: words.ASK_DESCRIPTION,
    parameters: obj({
      to: str({ description: words.ASK_TO }),
      text: str({ description: words.ASK_TEXT }),
      within: opt(str({ description: words.ASK_WITHIN })),
    }),
    replay: "safe",
    executionMode: "sequential",
    async execute({ to, text, within }, api, context) {
      const question = text.trim();
      const start = startOf(question);
      if (start === "") return failure(words.TEXT_EMPTY);
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

      // A call that ran before and left its time was about to make the thread and post the question, and may have.
      const earlier = await api.memo<number>("askedAt", context);
      const live = options.chat();
      if (live === undefined) return failure(earlier === undefined ? words.UNREACHABLE : words.uncertain(name));
      const signal = callSignal(live, context);
      let posting = false;
      try {
        const found = askable(options.roster(), name, live.self);
        if ("problem" in found) return failure(found.problem);
        const open = await options.questions.count(api, session, context);
        if (open >= MAX_OPEN) return failure(words.tooMany(open));
        const channel = await live.chat.openDm(found.agent.id, signal);

        // Fixed for the call, so that a run after a crash gives up at the same time as the first.
        const askedAt = earlier ?? (await api.memo("askedAt", Date.now(), context));
        // The question's thread: the one an earlier run of this call made, or a new one named for how the question starts.
        let thread = await api.memo<string>("thread", context);
        if (thread === undefined) {
          // A run that ended after chat made the thread and before the call kept its ID left it empty: that one is used.
          const left = earlier === undefined ? undefined : await emptyThread(live.chat, channel.id, start, signal);
          thread = await api.memo("thread", left ?? (await live.chat.createThread(channel.id, start, signal)).id, context);
        }
        posting = true;
        const posted = await live.chat.post(thread, question, requestId(options.recordsId, api), signal);
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
            start,
            thread,
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

/** The agent the model named, or why it can't be asked, in words for the model. */
function askable(roster: readonly RosterEntry[] | undefined, name: string, self: Member): { agent: RosterEntry } | { problem: string } {
  const named = nameOnRoster(roster, name, self.id);
  switch (named.kind) {
    case "unknown":
      return { problem: words.noRoster(name) };
    case "nobody":
      return { problem: words.nobody(name, named.roster.filter((each) => each.kind === "agent" && each.id !== self.id).map((each) => each.name)) };
    case "self":
      return { problem: words.yourself(named.member.name) };
    case "found":
      return named.member.kind === "person" ? { problem: words.aPerson(named.member.name) } : { agent: named.member };
  }
}

/**
 * The ID of a thread of the DM `channelId` called `name` that has no message in
 * it, if there is one: what a call that made its thread and ended before it posted
 * the question leaves.
 */
async function emptyThread(chat: ChatCalls, channelId: string, name: string, signal: AbortSignal): Promise<string | undefined> {
  const threads = await chat.threads(channelId, signal);
  return threads.find((thread) => !thread.main && thread.name === name && thread.preview === null)?.id;
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
