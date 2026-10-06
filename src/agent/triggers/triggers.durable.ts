import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { defineExtension, type Extension, type Harness } from "@earendil-works/pi-durable";
import type { Occurrence as OccurrenceView, TriggerDetail, TriggerSummary } from "../../contracts/agent/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { LeftOut, TriggerFiles } from "../home/index.ts";
import type { Breadcrumb } from "../inputs/index.ts";
import {
  plain,
  type SessionDefaults,
  SessionsDoc,
  type StoredTrigger,
  triggerSession,
  TriggersDoc,
} from "../records/durable.ts";
import type { TurnTask } from "../turns/durable.ts";
import { reconcile } from "./follow.durable.ts";
import { fire, ownerOf, type Where } from "./occurrence.durable.ts";
import { runTask } from "./run.durable.ts";
import { triggerTask } from "./task.durable.ts";
import { nextTimes, occurrences, RECENT, summaryOf } from "./views.durable.ts";

export interface TriggersOptions {
  /** The task that follows each occurrence, which is how an occurrence is taken up. */
  turn: TurnTask;
  /** What a session of a trigger's own is configured with when it is made. */
  defaults: SessionDefaults;
  /** Read the home's `triggers/` folder. */
  read(): Promise<TriggerFiles>;
  /**
   * Where the thread a trigger names is, for an occurrence that finds the agent
   * with no session behind it: the thread's channel, which only chat knows, or
   * why there is none to be had. It asks chat, so it is asked before the commit
   * that makes the occurrence and never inside it. Aborting `signal` gives up.
   */
  channelOf(threadId: string, signal: AbortSignal): Promise<{ channelId: string } | { problem: string }>;
  /** The home's breadcrumbs, read before the commit that makes an occurrence, which reads no files. */
  breadcrumbs(): Promise<readonly Breadcrumb[]>;
  /** Write the breadcrumb `<name>.md` in the home, in place of the one there is. */
  leaveBreadcrumb(name: string, text: string): Promise<void>;
  /** Told of an occurrence that could not be made. */
  onError(error: Error): void;
}

/** The agent's standing triggers. */
export interface Triggers {
  readonly extension: Extension;
  /**
   * Read the home's trigger files and make the triggers follow them, which is
   * what the agent does when it starts and when it is told to reload. A file
   * that checks out is the trigger's definition from now on: a new schedule
   * counts from now, and a new prompt is used from the next occurrence. A file
   * that is gone, or that says `enabled: false`, ends the trigger. A file that
   * does not check out leaves the trigger as it was. Answers with how many
   * triggers the agent has now, on or off, and the files it left out, and why.
   */
  reload(): Promise<{ count: number; leftOut: LeftOut[] }>;
  /** Every trigger the agent has, in order of name. */
  list(): Promise<TriggerSummary[]>;
  /** One trigger with its definition and recent occurrences. Refused when there is none of that name. */
  show(name: string): Promise<TriggerDetail>;
  /**
   * Fire a trigger once now, apart from its schedule, which does not move. A
   * trigger with a check runs it now, in a task of its own, and answers once that
   * task exists, with the occurrence the check will make, which has not ended:
   * whatever the check prints is news. Refused when there is none of that name.
   */
  fire(name: string): Promise<OccurrenceView>;
}

const context = BACKGROUND_CONTEXT;

/**
 * The triggers an agent runs. A trigger and each of its occurrences are
 * separate tasks of the engine. The trigger's task is a background task of a
 * conversation of its own that sleeps on the engine's timer until the next
 * occurrence is due, and keeps the revision of the trigger's schedule that it is
 * for and that time. When it wakes it makes the occurrence and the next time in
 * one commit, so an occurrence happens once however often the agent is killed
 * meanwhile, and one that fell due while the agent was down happens once at the
 * next start: the next time counts from when it fired. An occurrence is an input
 * of a session, followed by the same task as any input, and that task's record
 * is the occurrence's record. A trigger with no thread has a session of its
 * own, made at its first occurrence; with a thread, its occurrences go to the
 * session behind that thread. If the agent has none, the occurrence asks chat
 * which channel the thread is in, before the commit that makes it, and makes
 * the session there. An occurrence that is skipped, or that has nowhere to go,
 * is still an occurrence: its task ends at once with that outcome. A trigger with
 * a check runs it first, and a check that finds no news makes no occurrence and
 * no task: the trigger's record says when it last checked and how many checks in
 * a row have found none. A check run by hand is a task of its own, which makes
 * the occurrence when the check ends and leaves the trigger's own task, and so
 * its schedule, as it was. Nothing is kept beside the engine's records but the
 * last valid definition of each trigger, with what its checks have left.
 */
export function createTriggers(harness: Harness, options: TriggersOptions): Triggers {
  const { turn, defaults } = options;

  /**
   * Where the thread the trigger names is, when it names one and the agent has no
   * session behind it. Nothing otherwise, and nothing is asked of chat. A trigger
   * with a check has nobody to wake before its check has run, so it is asked
   * once `afterCheck` says it has, or that there is none to run.
   */
  async function whereTo(name: string, signal: AbortSignal, afterCheck = false): Promise<Where | undefined> {
    const found = await stored(name);
    const thread = found?.definition.thread ?? null;
    if (thread === null || (found?.definition.check !== undefined && !afterCheck)) return undefined;
    const sessions = (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
    if (Object.hasOwn(sessions, thread)) return undefined;
    return { thread, ...(await options.channelOf(thread, signal)) };
  }

  const parts = {
    turn,
    defaults,
    whereTo,
    breadcrumbs: () => options.breadcrumbs(),
    leaveBreadcrumb: (name: string, text: string) => options.leaveBreadcrumb(name, text),
    promptOf: async (name: string) => (await stored(name))?.definition.prompt ?? "",
    onError: (error: Error) => options.onError(error),
  };
  const task = triggerTask(parts);
  const run = runTask(parts);

  /** Reloading twice at once would reconcile twice, and the later reading may be the older. */
  let queue: Promise<unknown> = Promise.resolve();

  /** The stored trigger of this name, if the agent has one. */
  async function stored(name: string): Promise<StoredTrigger | undefined> {
    const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
    return Object.hasOwn(triggers, name) ? triggers[name] : undefined;
  }

  return {
    extension: defineExtension({ name: "triggers", tasks: [task, run] }),

    reload() {
      const reloaded = queue.then(async () => reconcile(harness, task, await options.read()));
      queue = reloaded.catch(() => undefined);
      return reloaded;
    },

    async list() {
      const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
      const times = await nextTimes(harness);
      const last = new Map<string, OccurrenceView>();
      for (const { trigger, view } of await occurrences(harness)) last.set(trigger, view);
      return Object.keys(triggers)
        .sort(byName)
        .map((name) => summaryOf(triggers[name]!, times.get(name), last.get(name)));
    },

    async show(name) {
      const found = await stored(name);
      if (found === undefined) refuse(noTrigger(name));
      const recent = (await occurrences(harness)).filter(({ trigger }) => trigger === name).map(({ view }) => view);
      const { definition } = found;
      return {
        ...summaryOf(found, (await nextTimes(harness)).get(name), recent.at(-1)),
        prompt: definition.prompt,
        overlap: definition.overlap,
        check: definition.check ?? null,
        session: definition.thread === null ? triggerSession(name) : null,
        occurrences: recent.slice(-RECENT).reverse(),
      };
    },

    async fire(name) {
      if ((await stored(name))?.definition.check !== undefined) {
        // The check runs in a task of its own, and the occurrence comes when it ends, with the ID this answers with.
        return harness.commit(async (tx) => {
          const triggers = (await tx.doc(TriggersDoc)).triggers;
          const found = Object.hasOwn(triggers, name) ? triggers[name] : undefined;
          if (found === undefined) refuse(noTrigger(name));
          if (found.definition.check === undefined) refuse(changed(name));
          const now = Date.now();
          const asked = { name, id: newId("occ"), firedAt: now, check: plain(found.definition.check) };
          await tx.createTask(run, asked, { ownership: { kind: "conversation" }, conversationId: await ownerOf(tx), background: true });
          return { id: asked.id, due: now, firedAt: now, byHand: true, ended: null, reason: null };
        }, context);
      }
      const where = await whereTo(name, new AbortController().signal, true);
      const breadcrumbs = await options.breadcrumbs();
      return harness.commit(async (tx) => {
        const triggers = (await tx.doc(TriggersDoc)).triggers;
        const found = Object.hasOwn(triggers, name) ? triggers[name] : undefined;
        if (found === undefined) refuse(noTrigger(name));
        const now = Date.now();
        return fire(tx, { turn, defaults, breadcrumbs }, plain(found.definition), { due: now, firedAt: now, byHand: true }, where);
      }, context);
    },
  };
}

const noTrigger = (name: string): string => `This agent has no trigger called ${name}.`;

const changed = (name: string): string => `The trigger ${name} was changed as it was being run, so it did not run. Run it again.`;

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
