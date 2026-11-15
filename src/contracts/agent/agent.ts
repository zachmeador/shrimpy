import { arr, method, nul, obj, remote, str, union } from "@earendil-works/chord";
import { agent, answerOf, RefusedSchema } from "../gateway/index.ts";
import {
  AgentModelsSchema,
  OccurrenceSchema,
  ReloadedSchema,
  SessionSummarySchema,
  TriggerDetailSchema,
  TriggerSummarySchema,
} from "./shapes.ts";

/**
 * One agent as the caller sees it, at `agent({ name: agent })`: its sessions
 * and its triggers, kept live, and what a client does with the agent as a whole.
 *
 * `refusal` is null, or why the caller may not watch this agent, and then the
 * rest of its state is empty and every method answers with that refusal. You,
 * the agent itself, an admin and a client on the agent's home socket may watch
 * it. It follows the live roster, so a promotion shows at once.
 */
export const Agent = remote("shrimpy.agent", {
  version: 1,
  params: { agent: str() },
  hostAddress: ({ agent: name }) => agent({ name }),
  variants: {
    all: {
      state: {
        /** Null, or why the caller may not watch this agent. */
        refusal: union([RefusedSchema, nul()]),
        /** Its sessions, in the order they were made, each with where it is and whether a turn is underway in it. */
        sessions: arr(SessionSummarySchema),
        /**
         * Its triggers, in order of name, each with when it is next due and how
         * its last occurrence ended. The agent reads its triggers from the files
         * of its home when it starts and whenever they change, and this is what
         * it runs now.
         */
        triggers: arr(TriggerSummarySchema),
      },
      methods: {
        /**
         * The models the agent can use now, each by provider and ID with the
         * name Pi has for it, and the model its sessions follow by default. A
         * model can be used when Pi's model runtime can reach it with the keys
         * and sign-ins the agent has and the servers its files declare.
         */
        models: method(undefined, answerOf(AgentModelsSchema)),
        /** One trigger with its definition and its most recent occurrences, newest first. */
        trigger: method(obj({ name: str() }), answerOf(TriggerDetailSchema)),
        /**
         * Fires a trigger once now, apart from its schedule, which it keeps,
         * answering with the occurrence it made, which has not ended yet unless
         * it was skipped. A trigger that is off can still be fired. A trigger
         * with a check runs it now, and whatever it prints counts as news.
         */
        fire: method(obj({ name: str() }), answerOf(OccurrenceSchema)),
        /**
         * Reads the home's instructions, context files, skills, triggers, wake
         * file and model again, now, after a reading that is under way. The agent
         * does this by itself within a few seconds of a change, so this is for
         * whoever has just changed a file and wants the answer at once. A file
         * that can't be used is left out and named in the answer.
         */
        reload: method(undefined, answerOf(ReloadedSchema)),
      },
    },
  },
});
