import type { AppRuntime } from "../../app/runtime.js";
import { formatSessionId } from "../../sessions/identity.js";
import { formatAgeShort } from "../../util/time-format.js";
import {
  readContextState,
  rememberSessionContextDelivery,
} from "./state.js";
import { renderTurnContextResult } from "./render.js";
import type {
  TurnContext,
  TurnContextDeliveryState,
  TurnContextInput,
  TurnContextItem,
} from "./types.js";

const MAX_ACTIVITY_ITEMS = 8;

export function selectSessionUnseenItems(
  input: TurnContextInput,
  items: TurnContextItem[],
): {
  items: TurnContextItem[];
  deliveryState: TurnContextDeliveryState;
} {
  const agentId = input.descriptor.key.agentId;
  const sessionId = input.sessionInstanceId
    ?? formatSessionId(input.descriptor.key);
  const state = readContextState(input.runtime, agentId);
  const session = state.sessions[sessionId] ?? { seenItems: {} };
  const latestActivitySequence = state.activity.at(-1)?.sequence;
  const unseenActivity = state.activity
    .filter((entry) =>
      entry.sequence > (session.activityCursor ?? 0)
      && entry.sessionId !== sessionId
    );
  const selectedActivity = unseenActivity.slice(-MAX_ACTIVITY_ITEMS);
  const activityItems = selectedActivity
    .map((entry): TurnContextItem => ({
      id: `activity:${entry.sequence}`,
      summary: `recent activity from ${entry.sessionLabel} ${activityAge(entry.at)} ago: ${entry.summary}`,
      inspect: entry.inspect,
      revision: String(entry.sequence),
    }));

  const candidates = [...activityItems, ...items];
  const unseen = candidates.filter((item) =>
    isAlwaysNewItem(item)
    || session.seenItems[item.id] !== itemFingerprint(item)
  );
  const seenItems = Object.fromEntries(
    unseen
      .filter((item) => !isAlwaysNewItem(item))
      .map((item) => [item.id, itemFingerprint(item)]),
  );

  return {
    items: unseen,
    deliveryState: {
      sessionId,
      seenItems,
      activityBaseCursor: selectedActivity[0]
        ? selectedActivity[0].sequence - 1
        : latestActivitySequence,
      activityItemSequences: selectedActivity.map((entry) => entry.sequence),
      ...(latestActivitySequence === undefined
        ? {}
        : { activityCursor: latestActivitySequence }),
    },
  };
}

export function markTurnContextDelivered(
  runtime: AppRuntime,
  context: TurnContext,
): void {
  if (!context.deliveryState) return;
  const delivered = new Set(
    renderTurnContextResult(context).deliveredItemIds,
  );
  const seenItems = Object.fromEntries(
    Object.entries(context.deliveryState.seenItems)
      .filter(([id]) => delivered.has(id)),
  );
  const activityCursor = deliveredActivityCursor(
    context.deliveryState,
    delivered,
  );
  rememberSessionContextDelivery(
    runtime,
    context.agentId,
    context.deliveryState.sessionId,
    {
      seenItems,
      ...(activityCursor === undefined ? {} : { activityCursor }),
    },
  );
}

function itemFingerprint(item: TurnContextItem): string {
  return item.revision ?? JSON.stringify([item.summary, item.inspect ?? null]);
}

function isAlwaysNewItem(item: TurnContextItem): boolean {
  return item.id.startsWith("turn:") || item.id.startsWith("activity:");
}

function activityAge(at: string): string {
  const timestamp = Date.parse(at);
  if (!Number.isFinite(timestamp)) return "at an unknown time";
  return formatAgeShort(Math.max(0, Date.now() - timestamp));
}

function deliveredActivityCursor(
  state: TurnContextDeliveryState,
  deliveredIds: Set<string>,
): number | undefined {
  let cursor = state.activityBaseCursor;
  const sequences = state.activityItemSequences ?? [];
  for (const sequence of sequences) {
    if (!deliveredIds.has(`activity:${sequence}`)) return cursor;
    cursor = sequence;
  }
  return sequences.length === 0
    ? state.activityCursor ?? cursor
    : state.activityCursor;
}
