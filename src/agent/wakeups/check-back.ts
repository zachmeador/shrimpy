import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool, type Extension, type ToolExecutionResult } from "@earendil-works/pi-durable";
import type { Wakeups } from "./wakeups.ts";
import { readWhen } from "./when.ts";
import * as words from "./words.ts";

/** What the tool that wakes the session later is handed: where the agent's wake-ups are kept. */
export interface WakeupToolsOptions {
  wakeups: Wakeups;
}

/** The most characters a note may have: it is shown to the model again, perhaps with others, when it is woken. */
const MAX_NOTE = 1_000;

/** A tool's answer: just these words. */
const answer = (text: string): ToolExecutionResult => ({ content: [{ type: "text", text }] });

/** A tool's answer when it did not do what was asked: just these words, marked as an error. */
const failure = (text: string): ToolExecutionResult => ({ isError: true, content: [{ type: "text", text }] });

/**
 * `check_back`: wake the session that calls it, once, after a delay or at a
 * time, with a note the model left itself. It answers at once with when, so the
 * model can end its turn. The wake-up is the session's and not the call's, and
 * a call that runs again after a crash finds the wake-up its first run set.
 */
export function checkBack(options: WakeupToolsOptions) {
  return defineTool({
    name: "check_back",
    description: words.CHECK_DESCRIPTION,
    parameters: Type.Object({
      in: Type.Optional(Type.String({ description: words.CHECK_IN })),
      at: Type.Optional(Type.String({ description: words.CHECK_AT })),
      note: Type.String({ description: words.CHECK_NOTE }),
    }),
    // The wake-up is named for the call, so running it again after a crash sets no second one.
    replay: "safe",
    async execute({ in: delay, at, note }, api, context) {
      const text = note.trim();
      if (text === "") return failure(words.NOTE_EMPTY);
      if (text.length > MAX_NOTE) return failure(words.noteTooLong(text.length, MAX_NOTE));

      // Fixed for the call, so that a run after a crash asks for the same time as the first.
      const askedAt = await api.memo("askedAt", Date.now(), context);
      const when = readWhen({ in: delay, at }, askedAt);
      if ("problem" in when) return failure(when.problem);

      const set = await options.wakeups.set(api, { askedAt, due: when.due, note: text }, context);
      if ("waiting" in set) return failure(words.tooMany(set.waiting));
      return answer(words.wakeSet(set.wakeup.due, set.wakeup.askedAt, set.inThread));
    },
  });
}

/** The tool that wakes the calling session later, as an extension to install in the engine's registry. */
export function wakeupTools(options: WakeupToolsOptions): Extension {
  return defineExtension({ name: "wakeup-tools", tools: [checkBack(options)] });
}
