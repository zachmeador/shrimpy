import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Cursor, Harness, TaskId, Tx } from "@earendil-works/pi-durable";
import { type LeftOut, nextOccurrence, sameSchedule, type TriggerFiles, type TriggerProblem } from "../home/index.ts";
import { plain, type StoredTrigger, TriggersDoc } from "../records/index.ts";
import { ownerOf } from "./occurrence.ts";
import { TRIGGER_TASK, type TriggerTask, type Waiting, type Waits } from "./task.ts";

const context = BACKGROUND_CONTEXT;

/**
 * Make the triggers follow `files`, in one commit: each trigger that is on has
 * one task for its schedule as it is, and one that is off or gone, or whose
 * schedule changed, has its task ended. Answers with how many triggers the agent
 * has now, and the files it left out, and why.
 */
export async function reconcile(
  harness: Harness,
  task: TriggerTask,
  files: TriggerFiles,
): Promise<{ count: number; leftOut: LeftOut[] }> {
  const now = Date.now();
  const result = await harness.commit(async (tx) => {
    const live = await liveTriggerTasks(tx);
    const doc = await tx.doc(TriggersDoc);
    const before = plain(doc.triggers);
    const after: Record<string, StoredTrigger> = {};
    const leftOut: LeftOut[] = [];

    // A schedule that is new gets a revision no other has had, so a task for the schedule before it, or for a trigger
    // of the same name that went away, is never taken for this one.
    let revisions = doc.revisions;
    for (const definition of files.triggers) {
      const old = Object.hasOwn(before, definition.name) ? before[definition.name] : undefined;
      const unchanged = old !== undefined && sameSchedule(old.definition.schedule, definition.schedule);
      after[definition.name] = { revision: unchanged ? old.revision : (revisions += 1), definition };
    }
    for (const problem of files.problems) {
      const old = keptFor(problem, before, after);
      if (old !== undefined && problem.name !== null) after[problem.name] = old;
      leftOut.push({
        file: problem.file,
        reason: old === undefined ? problem.reason : `${problem.reason}, so the trigger keeps its last valid definition`,
      });
    }

    // A trigger has one task for its schedule as it is: one that is for another revision, or for a trigger that is off
    // or gone, is ended at once, and a trigger that is on and has none gets one.
    const abort: TaskId[] = [];
    const create: Waiting[] = [];
    for (const [name, stored] of Object.entries(after)) {
      const mine = live.filter((each) => each.name === name);
      const current = stored.definition.enabled ? mine.find((each) => each.revision === stored.revision) : undefined;
      abort.push(...mine.filter((each) => each !== current).map((each) => each.id));
      if (stored.definition.enabled && current === undefined) {
        try {
          create.push({ name, revision: stored.revision, next: nextOccurrence(stored.definition.schedule, now) });
        } catch (error) {
          leftOut.push({ file: `triggers/${name}.md`, reason: `it is not a schedule that comes: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    }

    abort.push(...live.filter((each) => !Object.hasOwn(after, each.name)).map((each) => each.id));

    if (JSON.stringify(before) !== JSON.stringify(after)) doc.triggers = after;
    if (revisions !== doc.revisions) doc.revisions = revisions;
    if (create.length > 0) {
      const owner = await ownerOf(tx);
      for (const waiting of create) {
        await tx.createTask(task, waiting, { ownership: { kind: "conversation" }, conversationId: owner, background: true });
      }
    }
    return { abort, leftOut, count: Object.keys(after).length };
  }, context);
  for (const id of result.abort) await harness.abortTask(id, context);
  return { count: result.count, leftOut: result.leftOut };
}

/** The tasks that wait for a trigger and are not being ended, with what they are for. */
async function liveTriggerTasks(tx: Tx): Promise<{ id: TaskId; name: string; revision: number }[]> {
  const found: { id: TaskId; name: string; revision: number }[] = [];
  for (const status of ["pending", "running"] as const) {
    let cursor: Cursor | undefined;
    do {
      const page = await tx.scanTasks({ kind: TRIGGER_TASK, status, abortRequested: false }, 100, cursor);
      for (const record of page.items) {
        if ("checkpoint" in record.state) {
          const state = record.state.checkpoint as Waits;
          found.push({ id: record.id, name: (record.input as Waiting).name, revision: state.revision });
        }
      }
      cursor = page.next;
    } while (cursor !== undefined);
  }
  return found;
}

/**
 * The definition a trigger keeps when its file does not check out: the one it
 * had before, if it had one and no valid file has taken its place.
 */
function keptFor(
  problem: TriggerProblem,
  before: Record<string, StoredTrigger>,
  after: Record<string, StoredTrigger>,
): StoredTrigger | undefined {
  if (problem.name === null || Object.hasOwn(after, problem.name) || !Object.hasOwn(before, problem.name)) return undefined;
  return before[problem.name];
}
