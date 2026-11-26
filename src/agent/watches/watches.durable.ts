import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import type { CommitPublication, ConversationId, Harness, ToolExecutionApi, Tx } from "@earendil-works/pi-durable";
import type { WatchSummary } from "../../contracts/agent/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { Breadcrumb, PendingWatch, Watch, WatchResult } from "../inputs/index.ts";
import { copyOf, SessionsDoc, WatchesDoc } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";

const context = BACKGROUND_CONTEXT;

/** Live watches on other agents' replies in DM threads. */
export interface Watches {
  /** Every open watch across all threads, oldest first. */
  list(): Promise<WatchSummary[]>;
  /** Live list of open watches, as Chord's `self.follow` takes it. */
  readonly listed: FollowAttach<WatchSummary[]>;
  /**
   * Record a watch opened by `post` in a DM with another agent. Replaces any
   * earlier open watch from the same thread on the same target DM thread.
   */
  open(api: ToolExecutionApi, watch: Watch, context: Context): Promise<void>;
  /** Dismiss an open watch by ID silently (no wake line, does not wake the session). */
  cancel(id: string): Promise<void>;
  /** Silently drop any open watches whose target DM thread is `toThread` (e.g. when archived). */
  dropForThread(toThread: string): Promise<void>;
}

/**
 * Create the agent's watch tracker, backed by `WatchesDoc`.
 */
export function createWatches(harness: Harness): Watches {
  const list = async (): Promise<WatchSummary[]> => {
    const open = (await harness.snapshot(WatchesDoc, context))?.open ?? {};
    return Object.values(open)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((watch) => ({
        id: watch.id,
        fromThread: watch.fromThread,
        onAgent: watch.onAgent.id,
        onAgentName: watch.onAgent.name,
        toThread: watch.toThread,
        startedAt: watch.startedAt,
      }));
  };

  return {
    list,

    listed: follow({
      read: list,
      watch(changed) {
        const observation = harness.observeCommits({
          advance(publication) {
            if (changesWatches(publication)) setImmediate(changed);
          },
          end: () => undefined,
        });
        return () => observation.detach();
      },
    }),

    async open(api, watch, at) {
      await api.commit(async (tx) => {
        const doc = await tx.doc(WatchesDoc);
        const kept: Record<string, Watch> = {};
        for (const [id, existing] of Object.entries(copyOf(doc.open))) {
          if (existing.fromThread === watch.fromThread && existing.toThread === watch.toThread) continue;
          kept[id] = existing;
        }
        kept[watch.id] = watch;
        doc.open = kept;
      }, at);
    },

    async cancel(id) {
      await harness.commit(async (tx) => {
        const doc = await tx.doc(WatchesDoc);
        if (!Object.hasOwn(doc.open, id)) refuse(`There is no open watch called ${id}.`);
        doc.open = without(doc.open, id);
      }, context);
    },

    async dropForThread(toThread) {
      await harness.commit(async (tx) => {
        const doc = await tx.doc(WatchesDoc);
        const entries = Object.entries(copyOf(doc.open));
        const kept = entries.filter(([, watch]) => watch.toThread !== toThread);
        if (kept.length !== entries.length) doc.open = Object.fromEntries(kept);
      }, context);
    },
  };
}

/**
 * Settle watch `id` in the commit `tx` belongs to: remove it from `WatchesDoc`,
 * compute any other watches still open for the calling thread, and take up a
 * `WatchInput` in the calling session. Returns `false` if the watch was already
 * closed or dropped.
 */
export async function settleWatch(
  tx: Tx,
  turn: TurnTask,
  id: string,
  result: WatchResult,
  at: number,
  breadcrumbs: readonly Breadcrumb[],
): Promise<boolean> {
  const doc = await tx.doc(WatchesDoc);
  if (!Object.hasOwn(doc.open, id)) return false;
  const watch = copyOf(doc.open[id]!);
  const remaining = without(doc.open, id);
  doc.open = remaining;

  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const session = Object.hasOwn(sessions, watch.fromThread) ? sessions[watch.fromThread] : undefined;
  if (session === undefined) return true;

  const pending: PendingWatch[] = Object.values(remaining)
    .filter((other) => other.fromThread === watch.fromThread)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((other) => ({ agent: other.onAgent.name, thread: other.toThread }));

  await takeUp(
    tx,
    turn,
    session.conversationId as ConversationId,
    {
      settled: {
        watch: {
          id: watch.id,
          onAgent: watch.onAgent,
          toThread: watch.toThread,
          startedAt: watch.startedAt,
          start: watch.start,
        },
        result,
        at,
      },
      pending,
      threadId: watch.fromThread,
      channelId: watch.fromChannel,
    },
    breadcrumbs,
  );
  return true;
}

function changesWatches(publication: CommitPublication): boolean {
  return publication.changes.some(
    (change) => change.type === "document" && change.record.kind === WatchesDoc.definition.kind,
  );
}

function without(open: Record<string, Watch>, id: string): Record<string, Watch> {
  return Object.fromEntries(Object.entries(copyOf(open)).filter(([key]) => key !== id));
}
