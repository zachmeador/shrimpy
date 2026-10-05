import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-durable";
import type { WakeupToolsOptions } from "./options.ts";
import { answer, failure } from "./results.ts";
import { readWhen } from "./when.ts";
import * as words from "./words.ts";

/** The most characters a note may have: it is shown to the model again, perhaps with others, when it is woken. */
const MAX_NOTE = 1_000;

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
      return answer(words.wakeSet(set.wakeup.due, set.wakeup.askedAt));
    },
  });
}
