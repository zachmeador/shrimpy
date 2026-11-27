import type { Context } from "@earendil-works/chord/context";
import type { Message } from "@earendil-works/pi-ai";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  AssistantEntry,
  CompactionEntry,
  type Conversation,
  type ConversationId,
  type EntryId,
  type EntryRecord,
  type Harness,
  ResetEntry,
  UserEntry,
} from "@earendil-works/pi-durable";
import type {
  RequestInputBudget,
  RequestOmission,
  RequestPage,
  RequestSection,
  RequestSummary,
  SessionRequest,
} from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { digestText } from "../home/index.ts";
import type { InputProvenance, StoredInputOmission } from "../inputs/index.ts";
import {
  ContextRevisionsDoc,
  InputFactsDoc,
  RequestDetailDoc,
  RequestsIndexDoc,
  SessionsDoc,
  type StoredRequestDetail,
  type StoredRequestSummary,
  type StoredSectionRevision,
} from "../records/durable.ts";
import { noSessionYet } from "../sessions/durable.ts";
import {
  applyHookDeltas,
  buildRawEntriesAndOmissions,
  estimateContext,
  replaySectionMap,
  toAnswerEnding,
  toRequestMessage,
  toRequestTool,
  toRequestUsage,
} from "./messages.durable.ts";

const SCAN_PAGE = 200;
const ENTRY_ID_PREFIX = "entry:";

/** List model requests for a session, newest first, including unrecorded assistant entries from Pi's log. */
export async function listSessionRequests(
  harness: Harness,
  address: string,
  options: { before?: string; limit: number },
  ctx: Context,
): Promise<RequestPage> {
  const { conversationId, conversation } = await openSessionConversation(harness, address, ctx);
  const all = await mergedSummaries(harness, conversationId, conversation, ctx);
  const start = options.before === undefined ? 0 : Math.max(0, all.findIndex((item) => item.id === options.before) + 1);
  if (options.before !== undefined && start === 0) return { items: [], before: null };
  const items = all.slice(start, start + options.limit);
  const hasMore = start + options.limit < all.length;
  return { items, before: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/**
 * Reconstruct the full inspection view for one request: raw entries, effective
 * messages as sent after hooks, active sections with source revisions, selected
 * tools, omissions and budgets, and effective model and settings.
 */
export async function inspectSessionRequest(
  harness: Harness,
  address: string,
  options: { id?: string; entry?: number },
  ctx: Context,
): Promise<SessionRequest | null> {
  const { conversationId, conversation } = await openSessionConversation(harness, address, ctx);
  const all = await mergedSummaries(harness, conversationId, conversation, ctx);
  if (all.length === 0) return null;

  let chosen: RequestSummary | undefined;
  if (options.entry !== undefined) {
    chosen = all.find((item) => item.assistantEntry === options.entry);
    if (chosen === undefined) {
      const found = await entryById(conversation, options.entry as EntryId, ctx);
      if (found === undefined || !AssistantEntry.is(found)) return null;
      return rebuildUnrecorded(harness, conversationId, conversation, found, ctx);
    }
  } else if (options.id !== undefined) {
    chosen = all.find((item) => item.id === options.id);
    if (chosen === undefined && options.id.startsWith(ENTRY_ID_PREFIX)) {
      const parsed = Number(options.id.slice(ENTRY_ID_PREFIX.length));
      if (!Number.isInteger(parsed) || parsed < 0) return null;
      const found = await entryById(conversation, parsed as EntryId, ctx);
      if (found === undefined || !AssistantEntry.is(found)) return null;
      return rebuildUnrecorded(harness, conversationId, conversation, found, ctx);
    }
  } else {
    chosen = all[0];
  }

  if (chosen === undefined) return null;
  if (!chosen.captured) {
    if (chosen.assistantEntry === null) return null;
    const found = await entryById(conversation, chosen.assistantEntry as EntryId, ctx);
    if (found === undefined || !AssistantEntry.is(found)) return null;
    return rebuildUnrecorded(harness, conversationId, conversation, found, ctx);
  }

  const detail = await harness.snapshot(RequestDetailDoc, conversationId, chosen.id, ctx);
  if (detail === undefined) {
    if (chosen.assistantEntry === null) return null;
    const found = await entryById(conversation, chosen.assistantEntry as EntryId, ctx);
    if (found === undefined || !AssistantEntry.is(found)) return null;
    return rebuildUnrecorded(harness, conversationId, conversation, found, ctx);
  }
  return rebuildCaptured(harness, conversationId, conversation, detail, chosen.assistantEntry, ctx);
}

async function openSessionConversation(
  harness: Harness,
  address: string,
  ctx: Context,
): Promise<{ conversationId: ConversationId; conversation: Conversation }> {
  const sessions = (await harness.snapshot(SessionsDoc, ctx))?.sessions ?? {};
  const record = Object.hasOwn(sessions, address) ? sessions[address] : undefined;
  const conversationId = record?.conversationId as ConversationId | undefined;
  const conversation = conversationId === undefined ? undefined : await harness.conversation(conversationId, ctx);
  if (conversationId === undefined || conversation === undefined) refuse(noSessionYet(address));
  return { conversationId, conversation };
}

/** Merge captured request summaries with assistant entries from Pi's log, newest first. */
async function mergedSummaries(
  harness: Harness,
  conversationId: ConversationId,
  conversation: Conversation,
  ctx: Context,
): Promise<RequestSummary[]> {
  const [indexDoc, assistants] = await Promise.all([
    harness.snapshot(RequestsIndexDoc, conversationId, ctx),
    scanAssistantEntries(conversation, ctx),
  ]);
  const stored = indexDoc?.items ?? [];

  // Group assistant entries by their generating taskId in chronological order so retries map 1:1 with attempts.
  const byTask = new Map<number, EntryRecord[]>();
  for (const entry of assistants) {
    if (entry.byTaskId === undefined) continue;
    const taskId = Number(entry.byTaskId);
    const list = byTask.get(taskId) ?? [];
    list.push(entry);
    byTask.set(taskId, list);
  }

  const storedByTask = new Map<number, StoredRequestSummary[]>();
  for (const item of stored) {
    const list = storedByTask.get(item.taskId) ?? [];
    list.push(item);
    storedByTask.set(item.taskId, list);
  }

  const matchedEntries = new Set<number>();
  const entryForRequest = new Map<string, number>();
  for (const [taskId, attempts] of storedByTask) {
    const orderedAttempts = [...attempts].sort((a, b) => a.attempt - b.attempt);
    const entries = byTask.get(taskId) ?? [];
    for (let index = 0; index < orderedAttempts.length; index += 1) {
      const attempt = orderedAttempts[index]!;
      // Pair each attempt with the earliest unmatched assistant entry from this task that landed after its cutoff.
      const found = entries.find((entry) => !matchedEntries.has(entry.id) && entry.id > attempt.cutoff);
      if (found !== undefined) {
        matchedEntries.add(found.id);
        entryForRequest.set(attempt.id, found.id);
      }
    }
  }

  const summaries: RequestSummary[] = stored.map((item) => ({
    id: item.id,
    captured: true,
    at: item.at,
    attempt: item.attempt,
    cutoff: item.cutoff,
    assistantEntry: entryForRequest.get(item.id) ?? null,
    model: { provider: item.model.provider, id: item.model.id },
    thinkingLevel: item.thinkingLevel,
    estimatedTokens: item.estimatedTokens,
    compacted: item.compacted,
    omissionsCount: item.omissionsCount,
    outcome: item.outcome,
  }));

  // Surface any assistant entries that have no captured record (pre-upgrade turns or failed captures).
  for (const entry of assistants) {
    if (matchedEntries.has(entry.id)) continue;
    const message = entry.model?.[0];
    if (message?.role !== "assistant") continue;
    summaries.push({
      id: `${ENTRY_ID_PREFIX}${String(entry.id)}`,
      captured: false,
      at: message.timestamp,
      attempt: 1,
      cutoff: Math.max(0, entry.id - 1),
      assistantEntry: entry.id,
      model: { provider: message.provider, id: message.model },
      thinkingLevel: message.thinkingLevel ?? "off",
      estimatedTokens: null,
      compacted: false,
      omissionsCount: 0,
      outcome: {
        kind: "ended",
        at: message.timestamp,
        how: toAnswerEnding(message.stopReason),
        detail: message.errorMessage ?? null,
        usage: toRequestUsage(message.usage),
      },
    });
  }

  return summaries.sort((a, b) => b.cutoff - a.cutoff || b.attempt - a.attempt || b.at - a.at);
}

async function rebuildCaptured(
  harness: Harness,
  conversationId: ConversationId,
  conversation: Conversation,
  detail: Readonly<StoredRequestDetail>,
  assistantEntry: number | null,
  ctx: Context,
): Promise<SessionRequest> {
  const [view, revisionsDoc, inputFactsDoc] = await Promise.all([
    conversation.context(ctx, { at: detail.cutoff as EntryId }),
    harness.snapshot(ContextRevisionsDoc, ctx),
    harness.snapshot(InputFactsDoc, conversationId, ctx),
  ]);

  const { messages: rawEffective, modifiedIndices } = applyHookDeltas(view.messages, detail.hookDeltas);
  const effectiveMessages = rawEffective.map((message, index) => toRequestMessage(message, modifiedIndices.has(index)));
  const { rawEntries, omissions: transcriptOmissions } = buildRawEntriesAndOmissions(view, effectiveMessages);

  const beforeHead = await beforeHeadOmission(conversation, view.head, ctx);
  const { inputs, omissions: inputOmissions } = inputBudgetsAndOmissions(view.entries, inputFactsDoc?.byEntry);
  const homeOmissions: RequestOmission[] = detail.homeLeftOut.map(({ file, reason, carriedOver }) => ({
    kind: "home_file",
    file,
    reason,
    carriedOver,
  }));
  const omissions: RequestOmission[] = [
    ...homeOmissions,
    ...inputOmissions,
    ...(beforeHead === undefined ? [] : [beforeHead]),
    ...transcriptOmissions,
  ];

  const sections = buildSections(rawEffective, detail.sectionRevisions, revisionsDoc?.sections);
  const tools = getCurrentTools(rawEffective).map((tool) => toRequestTool(tool, detail.toolExtensions));
  const actualInputTokens = detail.outcome.kind === "ended" && detail.outcome.usage !== null ? detail.outcome.usage.input : null;

  return {
    summary: {
      id: detail.id,
      captured: true,
      at: detail.at,
      attempt: detail.attempt,
      cutoff: detail.cutoff,
      assistantEntry,
      model: { provider: detail.model.provider, id: detail.model.id },
      thinkingLevel: detail.thinkingLevel,
      estimatedTokens: detail.estimatedTokens,
      compacted: detail.compacted,
      omissionsCount: omissions.length,
      outcome: detail.outcome,
    },
    settings: {
      provider: detail.model.provider,
      id: detail.model.id,
      api: detail.model.api,
      name: detail.model.name,
      modelSource: detail.modelSource,
      thinkingLevel: detail.thinkingLevel,
      toolExecution: detail.toolExecution,
      maxTurns: detail.maxTurns,
      steeringMode: detail.steeringMode,
      followUpMode: detail.followUpMode,
      streamOptions: detail.streamOptions,
    },
    budget: {
      contextWindow: detail.model.contextWindow,
      maxTokens: detail.model.maxTokens,
      estimatedTokens: detail.estimatedTokens,
      actualInputTokens,
      compaction: detail.compaction,
      inputs,
    },
    sections,
    tools,
    deferredTools: [...detail.deferredTools],
    omissions,
    rawEntries,
    effectiveMessages,
  };
}

/** Reconstruct a best-effort pre-hook inspection view when a turn has no captured record. */
async function rebuildUnrecorded(
  harness: Harness,
  conversationId: ConversationId,
  conversation: Conversation,
  assistant: EntryRecord,
  ctx: Context,
): Promise<SessionRequest | null> {
  const message = assistant.model?.[0];
  if (message?.role !== "assistant") return null;

  const previous = (await conversation.entries({ maxEntryId: (assistant.id - 1) as EntryId }, 1, undefined, ctx)).items[0];
  const cutoff = previous?.id ?? (0 as EntryId);
  const [view, revisionsDoc, inputFactsDoc] = await Promise.all([
    previous === undefined ? Promise.resolve({ head: undefined, entries: [], contributions: [], messages: [] }) : conversation.context(ctx, { at: cutoff }),
    harness.snapshot(ContextRevisionsDoc, ctx),
    harness.snapshot(InputFactsDoc, conversationId, ctx),
  ]);

  const effectiveMessages = view.messages.map((each) => toRequestMessage(each, false));
  const { rawEntries, omissions: transcriptOmissions } = buildRawEntriesAndOmissions(view, effectiveMessages);
  const beforeHead = await beforeHeadOmission(conversation, view.head, ctx);
  const { inputs, omissions: inputOmissions } = inputBudgetsAndOmissions(view.entries, inputFactsDoc?.byEntry);
  const omissions: RequestOmission[] = [
    ...inputOmissions,
    ...(beforeHead === undefined ? [] : [beforeHead]),
    ...transcriptOmissions,
  ];

  const sections = buildSections(view.messages, {}, revisionsDoc?.sections);
  const tools = getCurrentTools(view.messages).map((tool) => toRequestTool(tool, {}));
  const estimatedTokens = view.messages.length === 0 ? 0 : estimateContext(view, view.messages);
  const usage = toRequestUsage(message.usage);

  return {
    summary: {
      id: `${ENTRY_ID_PREFIX}${String(assistant.id)}`,
      captured: false,
      at: message.timestamp,
      attempt: 1,
      cutoff: Number(cutoff),
      assistantEntry: assistant.id,
      model: { provider: message.provider, id: message.model },
      thinkingLevel: message.thinkingLevel ?? "off",
      estimatedTokens,
      compacted: false,
      omissionsCount: omissions.length,
      outcome: {
        kind: "ended",
        at: message.timestamp,
        how: toAnswerEnding(message.stopReason),
        detail: message.errorMessage ?? null,
        usage,
      },
    },
    settings: {
      provider: message.provider,
      id: message.model,
      api: message.api,
      name: null,
      modelSource: "unknown",
      thinkingLevel: message.thinkingLevel ?? "off",
      toolExecution: null,
      maxTurns: null,
      steeringMode: null,
      followUpMode: null,
      streamOptions: null,
    },
    budget: {
      contextWindow: null,
      maxTokens: null,
      estimatedTokens,
      actualInputTokens: usage?.input ?? null,
      compaction: null,
      inputs,
    },
    sections,
    tools,
    deferredTools: [],
    omissions,
    rawEntries,
    effectiveMessages,
  };
}

function buildSections(
  messages: readonly Message[],
  sectionRevisions: Readonly<Record<string, string>>,
  storedRevisions: Readonly<Record<string, StoredSectionRevision>> | undefined,
): RequestSection[] {
  const active = replaySectionMap(messages);
  const result: RequestSection[] = [];
  for (const [key, text] of active) {
    const sha256 = digestText(text);
    const revKey = Object.hasOwn(sectionRevisions, key) ? sectionRevisions[key]! : `${key}:${sha256}`;
    const stored = storedRevisions !== undefined && Object.hasOwn(storedRevisions, revKey) ? storedRevisions[revKey] : undefined;
    result.push({
      key,
      text,
      sha256,
      revisionRecorded: stored !== undefined,
      sources: stored === undefined ? [] : stored.sources.map((src) => ({ section: key, ...src })),
    });
  }
  return result;
}

function inputBudgetsAndOmissions(
  entries: readonly EntryRecord[],
  byEntry: Readonly<Record<string, InputProvenance>> | undefined,
): { inputs: RequestInputBudget[]; omissions: RequestOmission[] } {
  const inputs: RequestInputBudget[] = [];
  const omissions: RequestOmission[] = [];
  for (const entry of entries) {
    if (!UserEntry.is(entry)) continue;
    const key = String(entry.id);
    const fact = byEntry !== undefined && Object.hasOwn(byEntry, key) ? byEntry[key] : undefined;
    if (fact === undefined) {
      inputs.push({
        entry: entry.id,
        source: "other",
        backlogBudgetChars: null,
        backlogUsedChars: null,
        breadcrumbsShown: 0,
        breadcrumbsLimit: null,
      });
      continue;
    }
    inputs.push({
      entry: entry.id,
      source: fact.source,
      backlogBudgetChars: fact.backlogBudgetChars,
      backlogUsedChars: fact.backlogUsedChars,
      breadcrumbsShown: fact.breadcrumbsShown,
      breadcrumbsLimit: fact.breadcrumbsLimit,
    });
    for (const omission of fact.omissions) {
      omissions.push(toRequestInputOmission(entry.id, omission));
    }
  }
  return { inputs, omissions };
}

function toRequestInputOmission(entry: number, omission: StoredInputOmission): RequestOmission {
  switch (omission.kind) {
    case "backlog_cut":
      return {
        kind: "backlog_cut",
        entry,
        cut: omission.cut,
        atLeast: omission.atLeast,
        budgetChars: omission.budgetChars,
        usedChars: omission.usedChars,
        clipped: omission.clipped,
      };
    case "breadcrumb_deferred":
      return { kind: "breadcrumb_deferred", entry, deferred: omission.deferred, limit: omission.limit };
    case "breadcrumb_truncated":
      return {
        kind: "breadcrumb_truncated",
        entry,
        file: omission.file,
        limitChars: omission.limitChars,
        originalChars: omission.originalChars,
      };
    case "output_truncated":
      return {
        kind: "output_truncated",
        entry,
        source: omission.source,
        label: omission.label,
        reason: omission.reason,
      };
  }
}

async function beforeHeadOmission(
  conversation: Conversation,
  head: EntryRecord | undefined,
  ctx: Context,
): Promise<RequestOmission | undefined> {
  if (head === undefined || head.head === undefined) return undefined;
  let omittedEntries = 0;
  if (head.head > 0) {
    let cursor;
    do {
      const page = await conversation.entries({ maxEntryId: (head.head - 1) as EntryId }, SCAN_PAGE, cursor, ctx);
      omittedEntries += page.items.length;
      cursor = page.next;
    } while (cursor !== undefined);
  }
  const headKind: "compaction" | "reset" = CompactionEntry.is(head)
    ? "compaction"
    : ResetEntry.is(head)
      ? "reset"
      : "compaction";
  const reason = CompactionEntry.is(head) ? head.data.reason : null;
  return {
    kind: "before_head",
    headEntry: head.id,
    headKind,
    reason,
    omittedEntries,
  };
}

async function scanAssistantEntries(conversation: Conversation, ctx: Context): Promise<EntryRecord[]> {
  const entries: EntryRecord[] = [];
  let cursor;
  do {
    const page = await conversation.entries({ order: "ascending" }, SCAN_PAGE, cursor, ctx);
    for (const entry of page.items) {
      if (AssistantEntry.is(entry)) entries.push(entry);
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return entries;
}

async function entryById(conversation: Conversation, id: EntryId, ctx: Context): Promise<EntryRecord | undefined> {
  const page = await conversation.entries({ minEntryId: id, maxEntryId: id }, 1, undefined, ctx);
  return page.items[0];
}
