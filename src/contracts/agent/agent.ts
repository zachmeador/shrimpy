import { arr, evolve, method, nul, obj, remote, str, union } from "@earendil-works/chord";
import { agent, answerOf, RefusedSchema } from "../gateway/index.ts";
import {
  AgentModelsSchema,
  HomeEntrySchema,
  HomeFileSchema,
  OccurrenceSchema,
  PigmentSchema,
  ReloadedSchema,
  SessionSummarySchema,
  TriggerDetailSchema,
  TriggerSummarySchema,
} from "./shapes.ts";

/** The most bytes a file of the home has for the agent to show it as text: 1 MB. */
export const MAX_TEXT_BYTES = 1_000_000;

/** The most bytes a file of the home has for the agent to show it as an image: 10 MB. */
export const MAX_IMAGE_BYTES = 10_000_000;

/** `Agent` as it was first served, before its sigil, its pigment and its home's files. */
const AgentV1 = remote("shrimpy.agent", {
  version: 1,
  params: { agent: str() },
  hostAddress: ({ agent: id }) => agent({ id }),
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

/**
 * One agent as the caller sees it, at `agent({ id: agent })`: its sessions,
 * its triggers and how it looks, kept live, what a client does with the agent
 * as a whole, and its home's files, to look at and never to change.
 *
 * `refusal` is null, or why the caller may not watch this agent, and then its
 * sessions and triggers are empty and every method answers with that refusal.
 * Its sigil and pigment show to every caller. You, the agent itself, an admin
 * and a client on the agent's home socket may watch it. It follows the live
 * roster, so a promotion shows at once.
 */
export const Agent = evolve(AgentV1, (edit) =>
  edit
    /**
     * Its sigil: the twelve lines of `sigil` in its home's `agent.json`, `#`
     * for on and `.` for off, or null when it has none or it isn't twelve by
     * twelve. The agent reads it again whenever it changes.
     */
    .addState("all", "sigil", union([arr(str()), nul()]))
    /** The color its sigil is drawn in, as its `agent.json` names it, or null when it names none. */
    .addState("all", "pigment", union([PigmentSchema, nul()]))
    /**
     * The entries of a folder of the home, in order of name. `path` is where
     * the folder is in the home, with `/` between folders, and `""` is the
     * home itself. `state/` is never listed, and a path that
     * leads out of the home, by `..`, from `/` or through a link, is refused.
     */
    .addMethod("all", "folder", obj({ path: str() }), answerOf(arr(HomeEntrySchema)))
    /**
     * One file of the home, at a path as `folder` takes one: as text, up to
     * `MAX_TEXT_BYTES`, or as a PNG, JPEG, GIF or WebP image, up to
     * `MAX_IMAGE_BYTES`. Anything else is refused with why, and so is
     * anything in `state/` and any path `folder` refuses.
     */
    .addMethod("all", "file", obj({ path: str() }), answerOf(HomeFileSchema)),
);
