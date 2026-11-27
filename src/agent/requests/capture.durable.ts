import type { Context } from "@earendil-works/chord/context";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import {
  AgentDoc,
  type CompactionPolicy,
  type CompactionSettings,
  type ConversationId,
  DEFAULT_COMPACTION_POLICY,
  defineExtension,
  type Extension,
  type GenerationCheckpoint,
  GenerationTask,
  type Harness,
  type HarnessSettings,
  hook,
  type HookApi,
  type ModelRef,
  type TaskId,
  type Tx,
  UserEntry,
} from "@earendil-works/pi-durable";
import type { RequestCompactionBudget, RequestOutcome } from "../../contracts/agent/index.ts";
import type { HomeContext } from "../context/durable.ts";
import { digestText } from "../home/index.ts";
import { HOST_SETTINGS } from "../host/durable.ts";
import type { InputProvenance } from "../inputs/index.ts";
import {
  ContextRevisionsDoc,
  copyOf,
  InputFactsDoc,
  RequestDetailDoc,
  RequestsIndexDoc,
  type StoredHomeOmission,
  type StoredRequestDetail,
  type StoredRequestSummary,
  type StoredSectionRevision,
} from "../records/durable.ts";
import type { HomeModel } from "../sessions/durable.ts";
import {
  buildRawEntriesAndOmissions,
  diffHookMessages,
  estimateContext,
  replaySectionMap,
  toAnswerEnding,
  toRequestMessage,
  toRequestUsage,
} from "./messages.durable.ts";

export interface CaptureOptions {
  readonly context: HomeContext;
  readonly homeModel: () => HomeModel;
  readonly settings?: HarnessSettings;
}

/**
 * Extension that captures per-request metadata via `GenerationTask` hooks.
 *
 * Install this extension LAST so `beforeRequest` sees the final `messages`
 * after every other `beforeRequest` hook (such as `compactionNoteHook`) has
 * run. Because Pi's `HookApi` only exposes reads and task memos (which clear
 * once a task finishes), capture commits through the closed-over `harness`.
 * Capture is intentionally best-effort: Pi catches non-abort hook errors,
 * surfaces them via `onReport`, and still sends the provider request so a
 * diagnostic bug never blocks an agent from answering.
 */
export function createRequestExtension(harness: Harness, options: CaptureOptions): Extension {
  const harnessSettings = options.settings ?? HOST_SETTINGS;
  const captureHook = hook(GenerationTask, {
    async beforeRequest({ messages }, api, ctx) {
      await captureBeforeRequest(harness, options, harnessSettings, messages, api, ctx);
      return undefined;
    },
    async afterResponse(message, api, ctx) {
      await captureAfterResponse(harness, message, api, ctx);
    },
  });
  return defineExtension({ name: "requests", hooks: [captureHook] });
}

async function captureBeforeRequest(
  harness: Harness,
  options: CaptureOptions,
  harnessSettings: HarnessSettings,
  messages: readonly Message[],
  api: HookApi,
  ctx: Context,
): Promise<void> {
  const task = await harness.getTask(api.taskId, ctx);
  if (task === undefined || task.state.status !== "running") return;
  const checkpoint = task.state.checkpoint as GenerationCheckpoint;
  if (checkpoint.phase !== "request") return;

  const { attempt, compacted, model: ref, thinkingLevel, streamOptions, cutoff } = checkpoint;
  const conversation = await harness.conversation(api.conversationId, ctx);
  if (conversation === undefined) return;

  const [view, agent, agentDoc] = await Promise.all([
    conversation.context(ctx, { at: cutoff }),
    conversation.agent(ctx),
    api.snapshot(AgentDoc, api.conversationId, ctx),
  ]);

  const resolved = api.models.getModel(ref.provider, ref.modelId);
  const contextWindow = resolved !== undefined && resolved.contextWindow > 0 ? resolved.contextWindow : null;
  const maxTokens = resolved !== undefined && resolved.maxTokens > 0 ? resolved.maxTokens : null;

  const compaction = resolveCompactionBudget(harnessSettings.compaction, agent.compaction, ref, contextWindow);
  const estimatedTokens = estimateContext(view, messages);
  const hookDeltas = diffHookMessages(view.messages, messages);
  const modelSource = resolveModelSource(agentDoc?.model, options.homeModel());

  const activeSections = replaySectionMap(messages);
  const sectionRevisions: Record<string, string> = {};
  const newSectionRevisions: Record<string, StoredSectionRevision> = {};
  for (const [key, text] of activeSections) {
    const sha256 = digestText(text);
    const revKey = `${key}:${sha256}`;
    sectionRevisions[key] = revKey;
    const prov = options.context.provenance(key, text);
    if (prov !== undefined) {
      newSectionRevisions[revKey] = {
        key: prov.key,
        sha256: prov.sha256,
        sources: prov.sources.map((src) => ({
          path: src.path,
          sha256: src.sha256,
          bytes: src.bytes,
          mtimeMs: src.mtimeMs,
          origin: src.origin,
          carriedOver: src.carriedOver,
        })),
      };
    }
  }

  const homeLeftOut: StoredHomeOmission[] = options.context.leftOut().map(({ file, reason }) => ({
    file,
    reason,
    carriedOver: reason.includes("what was last read of it is kept"),
  }));

  const offeredTools = getCurrentTools(messages);
  const toolExtensions = resolveToolExtensions(agent, offeredTools.map((tool) => tool.name));
  const deferredTools = agent.deferred.map((tool) => tool.name);

  const effectiveForOmissions = messages.map((message) => toRequestMessage(message, false));
  const { omissions: transcriptOmissions } = buildRawEntriesAndOmissions(view, effectiveForOmissions);

  const id = requestIdKey(api.taskId, attempt);
  const now = Date.now();
  const detail: StoredRequestDetail = {
    id,
    taskId: Number(api.taskId),
    attempt,
    at: now,
    cutoff: Number(cutoff),
    compacted: compacted !== undefined,
    model: {
      provider: ref.provider,
      id: ref.modelId,
      api: resolved?.api ?? null,
      name: resolved?.name ?? null,
      contextWindow,
      maxTokens,
    },
    modelSource,
    thinkingLevel,
    toolExecution: harnessSettings.toolExecution ?? "parallel",
    maxTurns: agent.maxTurns ?? null,
    steeringMode: harnessSettings.steeringMode ?? "one-at-a-time",
    followUpMode: harnessSettings.followUpMode ?? "one-at-a-time",
    streamOptions: {
      transport: streamOptions.transport ?? null,
      timeoutMs: streamOptions.timeoutMs ?? null,
      cacheRetention: streamOptions.cacheRetention ?? null,
      maxRetries: streamOptions.maxRetries ?? null,
      deferred: streamOptions.deferred !== undefined && streamOptions.deferred !== false,
    },
    compaction,
    estimatedTokens,
    sectionRevisions,
    homeLeftOut,
    toolExtensions,
    deferredTools,
    ...(hookDeltas === undefined ? {} : { hookDeltas }),
    outcome: { kind: "in_flight" },
  };

  const activeUserIds = view.entries.filter((entry) => UserEntry.is(entry)).map((entry) => String(entry.id));

  await harness.commit(async (tx) => {
    const facts = await tx.doc(InputFactsDoc, api.conversationId);
    await promoteInputFacts(tx, api.conversationId, facts);

    let inputOmissionCount = 0;
    for (const entryId of activeUserIds) {
      if (Object.hasOwn(facts.byEntry, entryId)) {
        inputOmissionCount += facts.byEntry[entryId]!.omissions.length;
      }
    }

    const revisionsDoc = await tx.doc(ContextRevisionsDoc);
    for (const [revKey, rev] of Object.entries(newSectionRevisions)) {
      if (!Object.hasOwn(revisionsDoc.sections, revKey)) {
        revisionsDoc.sections[revKey] = rev;
      }
    }

    const beforeHeadCount = view.head === undefined ? 0 : 1;
    const omissionsCount = homeLeftOut.length + inputOmissionCount + transcriptOmissions.length + beforeHeadCount;
    const summary: StoredRequestSummary = {
      id,
      taskId: detail.taskId,
      attempt,
      at: now,
      cutoff: detail.cutoff,
      compacted: detail.compacted,
      model: { provider: ref.provider, id: ref.modelId },
      thinkingLevel,
      estimatedTokens,
      omissionsCount,
      outcome: { kind: "in_flight" },
    };

    const stored = await tx.doc(RequestDetailDoc, api.conversationId, id, copyOf(detail));
    Object.assign(stored, copyOf(detail));
    if (detail.hookDeltas === undefined) delete stored.hookDeltas;

    const indexDoc = await tx.doc(RequestsIndexDoc, api.conversationId);
    const existing = indexDoc.items.findIndex((item) => item.id === id);
    if (existing === -1) indexDoc.items.push(summary);
    else indexDoc.items[existing] = summary;
  }, ctx);
}

async function captureAfterResponse(
  harness: Harness,
  message: AssistantMessage,
  api: HookApi,
  ctx: Context,
): Promise<void> {
  const task = await harness.getTask(api.taskId, ctx);
  const checkpoint = task?.state.status === "running" ? (task.state.checkpoint as GenerationCheckpoint) : undefined;
  const checkpointAttempt =
    checkpoint?.phase === "request" || checkpoint?.phase === "poll" ? checkpoint.attempt : undefined;

  const outcome: RequestOutcome = {
    kind: "ended",
    at: Date.now(),
    how: toAnswerEnding(message.stopReason),
    detail: message.errorMessage ?? null,
    usage: toRequestUsage(message.usage),
  };

  await harness.commit(async (tx) => {
    const indexDoc = await tx.doc(RequestsIndexDoc, api.conversationId);
    const matchIndex =
      checkpointAttempt !== undefined
        ? indexDoc.items.findIndex((item) => item.id === requestIdKey(api.taskId, checkpointAttempt))
        : indexDoc.items.findLastIndex((item) => item.taskId === Number(api.taskId));
    if (matchIndex === -1) return;
    const item = indexDoc.items[matchIndex]!;
    item.outcome = outcome;
    const detail = await tx.doc(RequestDetailDoc, api.conversationId, item.id, placeholderDetail(item));
    detail.outcome = outcome;
  }, ctx);
}

/** Promote placed `InputFactsDoc.byRequest` records into `byEntry` and drop unplaced settled ones. */
async function promoteInputFacts(
  tx: Tx,
  conversationId: ConversationId,
  facts: { byRequest: Record<string, InputProvenance>; byEntry: Record<string, InputProvenance> },
): Promise<void> {
  const removed = new Set<string>();
  for (const reqId of Object.keys(facts.byRequest)) {
    const sub = await tx.submissionByRequest(conversationId, reqId);
    if (sub === undefined) continue;
    if (sub.entry !== undefined) {
      facts.byEntry[String(sub.entry)] = copyOf(facts.byRequest[reqId]!);
      removed.add(reqId);
    } else if (sub.status === "unanswered") {
      removed.add(reqId);
    }
  }
  if (removed.size > 0) {
    facts.byRequest = Object.fromEntries(Object.entries(copyOf(facts.byRequest)).filter(([key]) => !removed.has(key)));
  }
}

function resolveCompactionBudget(
  harnessCompaction: CompactionSettings | undefined,
  agentCompaction: CompactionSettings | undefined,
  model: ModelRef,
  contextWindow: number | null,
): RequestCompactionBudget {
  const key = `${model.provider}/${model.modelId}`;
  const policy: CompactionPolicy = {
    ...DEFAULT_COMPACTION_POLICY,
    ...pickPolicy(harnessCompaction),
    ...pickPolicy(agentCompaction),
    ...pickPolicy(harnessCompaction?.modelOverrides?.[key]),
    ...pickPolicy(agentCompaction?.modelOverrides?.[key]),
  };
  if (agentCompaction?.enabled === false) policy.enabled = false;
  const blockingAt = contextWindow !== null && contextWindow > 0 ? contextWindow - policy.reserveTokens : null;
  const backgroundAt =
    blockingAt !== null && policy.backgroundTokens > 0 ? blockingAt - policy.backgroundTokens : null;
  return {
    enabled: policy.enabled,
    reserveTokens: policy.reserveTokens,
    keepRecentTokens: policy.keepRecentTokens,
    backgroundTokens: policy.backgroundTokens,
    blockingAt,
    backgroundAt,
  };
}

function pickPolicy(settings: Partial<CompactionPolicy> | undefined): Partial<CompactionPolicy> {
  if (settings === undefined) return {};
  return {
    ...(settings.enabled === undefined ? {} : { enabled: settings.enabled }),
    ...(settings.reserveTokens === undefined ? {} : { reserveTokens: settings.reserveTokens }),
    ...(settings.keepRecentTokens === undefined ? {} : { keepRecentTokens: settings.keepRecentTokens }),
    ...(settings.backgroundTokens === undefined ? {} : { backgroundTokens: settings.backgroundTokens }),
  };
}

function resolveModelSource(
  agentModel: ModelRef | undefined,
  home: HomeModel,
): "session" | "home" | "folder" | "unknown" {
  if (agentModel !== undefined && (agentModel.provider !== home.model.provider || agentModel.modelId !== home.model.modelId)) {
    return "session";
  }
  return home.fromHome ? "home" : "folder";
}

function resolveToolExtensions(
  agent: { readonly extensions: readonly Extension[] },
  offeredNames: readonly string[],
): Record<string, string> {
  const wanted = new Set(offeredNames);
  const result: Record<string, string> = {};
  for (const extension of agent.extensions) {
    for (const tool of extension.tools ?? []) {
      if (wanted.has(tool.name)) result[tool.name] = extension.name;
    }
  }
  return result;
}

export const requestIdKey = (taskId: TaskId | number, attempt: number): string => `${String(Number(taskId))}:${String(attempt)}`;

function placeholderDetail(item: StoredRequestSummary): StoredRequestDetail {
  return {
    id: item.id,
    taskId: item.taskId,
    attempt: item.attempt,
    at: item.at,
    cutoff: item.cutoff,
    compacted: item.compacted,
    model: { provider: item.model.provider, id: item.model.id, api: null, name: null, contextWindow: null, maxTokens: null },
    modelSource: "unknown",
    thinkingLevel: item.thinkingLevel,
    toolExecution: null,
    maxTurns: null,
    steeringMode: null,
    followUpMode: null,
    streamOptions: { transport: null, timeoutMs: null, cacheRetention: null, maxRetries: null, deferred: false },
    compaction: {
      enabled: DEFAULT_COMPACTION_POLICY.enabled,
      reserveTokens: DEFAULT_COMPACTION_POLICY.reserveTokens,
      keepRecentTokens: DEFAULT_COMPACTION_POLICY.keepRecentTokens,
      backgroundTokens: DEFAULT_COMPACTION_POLICY.backgroundTokens,
      blockingAt: null,
      backgroundAt: null,
    },
    estimatedTokens: item.estimatedTokens,
    sectionRevisions: {},
    homeLeftOut: [],
    toolExtensions: {},
    deferredTools: [],
    outcome: item.outcome,
  };
}
