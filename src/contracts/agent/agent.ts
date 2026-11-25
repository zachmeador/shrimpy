import { arr, bool, method, nul, obj, remote, str, union } from "@earendil-works/chord";
import { agent, answerOf, RefusedSchema } from "../gateway/index.ts";
import {
  AgentModelSchema,
  DefaultModelSchema,
  HomeEntrySchema,
  ModelIdSchema,
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

/**
 * One agent as the caller sees it, at `agent({ id: agent })`: its sessions,
 * its triggers, its default model and how it looks, kept live, what a client
 * does with the agent as a whole, and its home's files, to look at. Through
 * this contract the agent changes its own files only as `setModel` and
 * `switchTrigger` ask: the model its `agent.json` names, and whether a trigger
 * is on. Everything else in the home, such as making or removing a trigger or
 * what wakes it in a room, it changes with its own tools and shell.
 *
 * `refusal` is null, or why the caller may not watch this agent, and then its
 * sessions and triggers are empty, its model is null and every method answers
 * with that refusal.
 * Its sigil and pigment show to every caller. You, the agent itself, an admin
 * and a client on the agent's home socket may watch it. It follows the live
 * roster, so a promotion shows at once.
 */
export const Agent = remote("shrimpy.agent", {
  version: 3,
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
        /**
         * Its sigil: the twelve lines of `sigil` in its home's `agent.json`, `#`
         * for on and `.` for off, or null when it has none or it isn't twelve by
         * twelve. The agent reads it again whenever it changes.
         */
        sigil: union([arr(str()), nul()]),
        /** The color its sigil is drawn in, as its `agent.json` names it, or null when it names none. */
        pigment: union([PigmentSchema, nul()]),
        /**
         * The model its sessions follow by default, which a session follows
         * until it is given another, as the agent last read it from its home.
         */
        model: union([DefaultModelSchema, nul()]),
      },
      methods: {
        /**
         * The models the agent can use now, in order of provider and then ID,
         * each with the name Pi has for it. A model can be used when Pi's model
         * runtime can reach it with the keys and sign-ins the agent has and the
         * servers its files declare. The default model is missing from the list
         * when the agent can't use it now.
         */
        models: method(undefined, answerOf(arr(AgentModelSchema))),
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
        /**
         * Names `model` in the home's `agent.json`, or takes the model out of it
         * for null, so that the agent follows the folder's default model, then
         * reads the home again and answers as `reload` does. A model the agent
         * can't use now is refused, and so is null when the folder has no
         * default model or the agent can't use it, and then the file is left
         * as it was.
         */
        setModel: method(obj({ model: union([ModelIdSchema, nul()]) }), answerOf(ReloadedSchema)),
        /**
         * Turns the trigger `name` on or off in its file, `triggers/<name>.md`
         * in the home, then reads the home again, and answers with the trigger
         * as the agent runs it now. A trigger that is on comes due on its
         * schedule, counted from now; one that is off never does, though `fire`
         * still runs it, and an occurrence that is running goes on. A trigger
         * that is already as asked is left alone. A name the home has no trigger
         * of is refused, and so is a file that doesn't check out, which is left
         * as it was.
         */
        switchTrigger: method(obj({ name: str(), on: bool() }), answerOf(TriggerSummarySchema)),
        /**
         * The entries of a folder of the home, in order of name. `path` is where
         * the folder is in the home, with `/` between folders, and `""` is the
         * home itself. `state/` is never listed, and a path that
         * leads out of the home, by `..`, from `/` or through a link, is refused.
         */
        folder: method(obj({ path: str() }), answerOf(arr(HomeEntrySchema))),
        /**
         * One file of the home, at a path as `folder` takes one: as text, up to
         * `MAX_TEXT_BYTES`, or as a PNG, JPEG, GIF or WebP image, up to
         * `MAX_IMAGE_BYTES`. Anything else is refused with why, and so is
         * anything in `state/` and any path `folder` refuses.
         */
        file: method(obj({ path: str() }), answerOf(HomeFileSchema)),
      },
    },
  },
});
