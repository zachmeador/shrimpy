import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type CommitPublication, defineExtension, type Extension, type Harness } from "@earendil-works/pi-durable";
import type { Occurrence as OccurrenceView, OnceTrigger, TriggerDetail, TriggerSummary } from "../../contracts/agent/index.ts";
import type { TriggerCheck, TriggerFiles } from "../../contracts/agent/node.ts";
import { compare, type LeftOut } from "../../lib/files/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { type Breadcrumb, isOccurrence, type Outstanding, type Place } from "../inputs/index.ts";
import { copyOf, type SessionDefaults, SessionsDoc, type StoredTrigger, TriggersDoc } from "../records/durable.ts";
import { TURN_TASK, type TurnTask } from "../turns/durable.ts";
import { reconcile } from "./follow.durable.ts";
import { fire, ownerOf, type Where } from "./occurrence.durable.ts";
import { cancelOnce, createOnceTask, listOnce, scheduleOnce, touchesOnce } from "./once.durable.ts";
import { RUN_TASK, runTask } from "./run.durable.ts";
import { TRIGGER_TASK, triggerTask } from "./task.durable.ts";
import { triggerTool } from "./tool.durable.ts";
import { nextTimes, occurrences, RECENT, summaryOf } from "./views.durable.ts";

export interface TriggersOptions {
  home: string;
  triggerCheck?: TriggerCheck;
  turn: TurnTask;
  defaults: SessionDefaults;
  read(): Promise<TriggerFiles>;
  /** Called by the `trigger` tool after modifying `triggers/<name>.md` to reconcile immediately. */
  onFilesChanged(): Promise<void>;
  channelOf(threadId: string, signal: AbortSignal): Promise<{ channelId: string; place?: Place } | { problem: string }>;
  breadcrumbs(): Promise<readonly Breadcrumb[]>;
  leaveBreadcrumb(name: string, text: string): Promise<void>;
  onError(error: Error): void;
}

/** The agent's standing and one-shot triggers. */
export interface Triggers {
  readonly extension: Extension;
  readonly toolExtension: Extension;
  reload(): Promise<{ count: number; leftOut: LeftOut[] }>;
  list(): Promise<TriggerSummary[]>;
  readonly listed: FollowAttach<TriggerSummary[]>;
  onceList(): Promise<OnceTrigger[]>;
  readonly onceListed: FollowAttach<OnceTrigger[]>;
  show(name: string): Promise<TriggerDetail>;
  fire(name: string): Promise<OccurrenceView>;
  cancelOnce(id: string): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export function createTriggers(harness: Harness, options: TriggersOptions): Triggers {
  const { turn, defaults } = options;

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
  const once = createOnceTask({
    turn,
    defaults,
    breadcrumbs: () => options.breadcrumbs(),
    onError: (error: Error) => options.onError(error),
  });

  async function stored(name: string): Promise<StoredTrigger | undefined> {
    const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
    return Object.hasOwn(triggers, name) ? triggers[name] : undefined;
  }

  const list = async (): Promise<TriggerSummary[]> => {
    const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
    const times = await nextTimes(harness);
    const last = new Map<string, OccurrenceView>();
    for (const { trigger, view } of await occurrences(harness)) last.set(trigger, view);
    return Object.keys(triggers)
      .sort(compare)
      .map((name) => summaryOf(triggers[name]!, times.get(name), last.get(name)));
  };

  const onceList = (): Promise<OnceTrigger[]> => listOnce(harness);

  const toolExtension = triggerTool({
    home: options.home,
    triggerCheck: options.triggerCheck ?? {},
    listStanding: list,
    listOnce: onceList,
    scheduleOnce: (api, target, request, at) => scheduleOnce(api, once, defaults, target, request, at),
    cancelOnce: (id) => cancelOnce(harness, id),
    channelOf: (threadId, signal) => options.channelOf(threadId, signal),
    reloadFiles: () => options.onFilesChanged(),
  });

  return {
    extension: defineExtension({ name: "triggers", tasks: [task, run, once] }),
    toolExtension,

    list,

    listed: follow({
      read: list,
      watch(changed) {
        const observation = harness.observeCommits({
          advance(publication) {
            if (changesTriggers(publication)) setImmediate(changed);
          },
          end: () => undefined,
        });
        return () => observation.detach();
      },
    }),

    onceList,

    onceListed: follow({
      read: onceList,
      watch(changed) {
        const observation = harness.observeCommits({
          advance(publication) {
            if (touchesOnce(publication)) setImmediate(changed);
          },
          end: () => undefined,
        });
        return () => observation.detach();
      },
    }),

    reload: async () => reconcile(harness, task, await options.read()),

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
        occurrences: recent.slice(-RECENT).reverse(),
      };
    },

    async fire(name) {
      if ((await stored(name))?.definition.check !== undefined) {
        return harness.commit(async (tx) => {
          const triggers = (await tx.doc(TriggersDoc)).triggers;
          const found = Object.hasOwn(triggers, name) ? triggers[name] : undefined;
          if (found === undefined) refuse(noTrigger(name));
          if (found.definition.check === undefined) refuse(changed(name));
          const now = Date.now();
          const asked = { name, id: newId("occ"), firedAt: now, check: copyOf(found.definition.check) };
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
        return fire(tx, { turn, defaults, breadcrumbs }, copyOf(found.definition), { due: now, firedAt: now, byHand: true }, where);
      }, context);
    },

    cancelOnce: (id) => cancelOnce(harness, id),
  };
}

function changesTriggers(publication: CommitPublication): boolean {
  return publication.changes.some((change) => {
    if (change.type === "document") return change.record.kind === TriggersDoc.definition.kind;
    if (change.type !== "task") return false;
    const { kind } = change.value;
    return kind === TRIGGER_TASK || kind === RUN_TASK || (kind === TURN_TASK && isOccurrence(change.value.input as Outstanding));
  });
}

const noTrigger = (name: string): string => `This agent has no trigger called ${name}.`;

const changed = (name: string): string => `The trigger ${name} was changed as it was being run, so it did not run. Run it again.`;
