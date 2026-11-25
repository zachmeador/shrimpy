import { valueOf } from "../../contracts/gateway/index.ts";
import { type ChatCalls, Down } from "../network/index.ts";
import type { Holdings } from "./holdings.ts";
import { openThreadOf } from "./model.ts";
import { chatProblem } from "./sending.ts";
import type { Store } from "./store.ts";
import { typedName } from "./written.ts";

/** Renaming the open thread, and archiving it or bringing it back, which post nothing. */
export interface Renaming {
  rename(typed: string): Promise<void>;
  archive(archived: boolean): Promise<void>;
}

/**
 * Renaming and archiving, each decided on the revision of the thread the
 * person saw, so that chat refuses it once the thread has changed since. What
 * chat refuses, or doesn't answer within `sendMs`, is said in a notice.
 */
export function createRenaming(store: Store, held: Holdings, sendMs: number): Renaming {
  /** Ask chat for `kind` of change to the open thread, which `ask` makes with the thread's ID and its revision as the person saw it. */
  async function change(
    kind: "rename" | "archive" | "unarchive",
    ask: (calls: ChatCalls, thread: string, revision: number, signal: AbortSignal) => Promise<unknown>,
  ): Promise<void> {
    const model = store.model();
    const { item } = model.open;
    const thread = openThreadOf(model);
    // Only a channel's members rename or archive its threads.
    if (thread === undefined || item?.kind !== "thread" || item.place.kind === "read-only") return;
    const answered = AbortSignal.timeout(sendMs);
    try {
      if (model.chat.state === "down") throw new Down(model.chat.why);
      await ask(held.chat.calls, thread.id, thread.revision, answered);
    } catch (error) {
      store.say({ kind: "not-changed", change: kind, problem: chatProblem(error, answered) });
    }
  }

  return {
    async rename(typed) {
      const name = typedName(typed);
      // An empty name names nothing, and the name it has already changes nothing.
      if (name === "" || name === openThreadOf(store.model())?.name) return;
      await change("rename", async (calls, thread, revision, signal) => valueOf(await calls.rename(thread, name, revision, signal)));
    },
    async archive(archived) {
      if (openThreadOf(store.model())?.archived === archived) return;
      await change(archived ? "archive" : "unarchive", async (calls, thread, revision, signal) =>
        valueOf(await calls.archive(thread, archived, revision, signal)),
      );
    },
  };
}
