import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AppRuntime } from "../app/runtime.js";
import {
  sessionResetMessageInput,
  sessionRestoreMessageInput,
  sessionThinkingLevelMessageInput,
} from "../channels/index.js";
import {
  INFERENCE_PARAM_NAMES,
  resolveModelVariantInference,
  type InferenceParamName,
  type ModelVariantInference,
} from "../inference/params.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import {
  resolveSessionCompactionPolicy,
  type EffectiveCompactionPolicy,
} from "./compaction-policy.js";
import { openDirectAgentSession } from "./direct.js";
import { createGatewaySessionDescriptor } from "./spec.js";
import {
  archiveSessionDir,
  findActiveSessionFile,
  listArchivedSessionDirs,
  resolveArchivedSessionDir,
  restoreArchivedSessionDir,
} from "./storage.js";

const LOCAL_DIRECT_CHANNELS = new Set(["tui", "run"]);

export type SessionLifecycleAction = "new" | "clear" | "restore";

export interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
}

export interface SingleSessionListingSummary {
  channel: string;
  active: SessionPathSummary;
  archives: SessionPathSummary[];
}

export interface SessionListingSummary {
  agentId: string;
  sessionsRoot: string;
  active: Array<SessionPathSummary & { channel: string }>;
  recentArchives: Array<SessionPathSummary & { channel: string }>;
}

export interface SessionCompactionPolicySummary {
  agentId: string;
  channel: string;
  sessionType: string;
  sessionDir: string;
  activeSession: SessionPathSummary;
  model?: {
    provider: string;
    id: string;
    contextWindow?: number;
    inference?: ModelVariantInference;
  };
  effective: EffectiveCompactionPolicy;
  recorded?: EffectiveCompactionPolicy;
  recordedSession?: {
    provider?: string;
    id?: string;
    bootedAt?: string;
    inference?: ModelVariantInference;
  };
  restartRequired: boolean;
  note: string;
}

export type SessionLifecycleResult =
  | {
    kind: "local_reset";
    agentId: string;
    channel: string;
    archivedTo?: string;
  }
  | {
    kind: "local_restore";
    agentId: string;
    channel: string;
    restoredFrom: string;
    archivedPreviousTo?: string;
  }
  | {
    kind: "requested_reset";
    action: "new" | "clear";
    agentId: string;
    channel: string;
  }
  | {
    kind: "requested_restore";
    agentId: string;
    channel: string;
    archiveName?: string;
    requestedArchive?: string;
  };

export type SessionThinkingResult =
  | {
    kind: "local_thinking";
    agentId: string;
    channel: string;
    requestedLevel: ThinkingLevel;
    effectiveLevel: ThinkingLevel;
  }
  | {
    kind: "requested_thinking";
    agentId: string;
    channel: string;
    level: ThinkingLevel;
  };

export function isLocalDirectChannel(channel: string): boolean {
  return LOCAL_DIRECT_CHANNELS.has(channel);
}

export async function inspectSessionCompactionPolicy(
  runtime: AppRuntime,
  input: {
    channel: string;
    agentId?: string;
    sessionType?: string;
  },
): Promise<SessionCompactionPolicySummary> {
  const agent = runtime.getAgent(input.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const sessionType = input.sessionType ?? (isLocalDirectChannel(input.channel) ? input.channel : "gateway");
  const descriptor = createGatewaySessionDescriptor({
    workspacePath: agentRoot,
    agentId: agent.id,
    channel: input.channel,
  });
  descriptor.kind = sessionType;

  const bootstrap = await runtime.createBootstrap({ agentId: agent.id });
  const model = runtime.resolveModel(
    bootstrap,
    undefined,
    undefined,
    agent.model,
    { allowMissingDefault: true },
  );
  const inference = resolveModelVariantInference({
    modelsPath: bootstrap.modelsPath,
    model,
  });
  const effective = resolveSessionCompactionPolicy({
    runtimeConfig: runtime.resolved.runtime,
    descriptor,
    model,
  });
  const activeSession = summarizeActiveSessionPath(descriptor.sessionDir);
  const recorded = activeSession.exists
    ? readRecordedCompactionPolicy(activeSession.path)
    : undefined;
  const recordedSession = activeSession.exists
    ? readRecordedSessionRuntime(activeSession.path)
    : undefined;
  const restartReasons = activeSession.exists
    ? compactionRestartReasons({
      recordedPolicy: recorded,
      effectivePolicy: effective,
      recordedSession,
      model,
      inference,
    })
    : [];
  const restartRequired = restartReasons.length > 0;
  const note = compactionInspectionNote({
    activeSessionExists: activeSession.exists,
    restartReasons,
  });

  return {
    agentId: agent.id,
    channel: input.channel,
    sessionType,
    sessionDir: descriptor.sessionDir,
    activeSession,
    model: model
      ? {
        provider: model.provider,
        id: model.id,
        contextWindow: model.contextWindow,
        inference,
      }
      : undefined,
    effective,
    recorded,
    recordedSession,
    restartRequired,
    note,
  };
}

export function summarizeAgentSessions(
  runtime: AppRuntime,
  opts?: {
    agentId?: string;
    channel?: string;
  },
): SessionListingSummary | SingleSessionListingSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const sessionsRoot = `${agentRoot}/sessions`;

  if (opts?.channel) {
    const sessionDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: agent.id,
      channel: opts.channel,
    }).sessionDir;
    return {
      channel: opts.channel,
      active: summarizeActiveSessionPath(sessionDir),
      archives: listArchivedSessionDirs(sessionDir).map(summarizeSessionPath),
    };
  }

  const sessionDirs = !existsSync(sessionsRoot)
    ? []
    : readdirSync(sessionsRoot).map((entry) => ({
      channel: entry,
      path: `${sessionsRoot}/${entry}`,
    }));

  const active = sessionDirs
    .map((entry) => ({
      channel: entry.channel,
      path: findActiveSessionFile(entry.path),
    }))
    .filter((entry): entry is { channel: string; path: string } =>
      entry.path !== undefined
    )
    .map((entry) => ({
      channel: entry.channel,
      ...summarizeSessionPath(entry.path),
    }));

  const recentArchives = sessionDirs
    .flatMap((summary) =>
      listArchivedSessionDirs(summary.path).map((path) => ({
        channel: summary.channel,
        ...summarizeSessionPath(path),
      }))
    )
    .sort((a, b) => b.path.localeCompare(a.path))
    .slice(0, 20);

  return {
    agentId: agent.id,
    sessionsRoot,
    active,
    recentArchives,
  };
}

export function executeSessionLifecycleAction(
  runtime: AppRuntime,
  input: {
    action: SessionLifecycleAction;
    channel: string;
    agentId?: string;
    archive?: string;
  },
): SessionLifecycleResult {
  const agent = runtime.getAgent(input.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const sessionDir = createGatewaySessionDescriptor({
    workspacePath: agentRoot,
    agentId: agent.id,
    channel: input.channel,
  }).sessionDir;

  if (isLocalDirectChannel(input.channel)) {
    return executeLocalSessionLifecycle({
      action: input.action,
      sessionDir,
      channel: input.channel,
      agentId: agent.id,
      archive: input.archive,
    });
  }

  const channelBus = runtime.createChannelBus();

  if (input.action === "restore") {
    const archivePath = input.archive
      ? resolveArchivedSessionDir(sessionDir, input.archive)
      : undefined;
    if (input.archive && !archivePath) {
      throw new Error(`archive not found for ${agent.id}/${input.channel}: ${input.archive}`);
    }

    channelBus.publish(sessionRestoreMessageInput({
      channel: input.channel,
      targetAgentId: agent.id,
      archiveName: archivePath ? basename(archivePath) : undefined,
      sender: cliSender(),
      origin: cliOrigin(input.channel),
      command: "/restore",
    }));

    return {
      kind: "requested_restore",
      agentId: agent.id,
      channel: input.channel,
      archiveName: archivePath ? basename(archivePath) : undefined,
      requestedArchive: input.archive,
    };
  }

  channelBus.publish(sessionResetMessageInput({
    channel: input.channel,
    targetAgentId: agent.id,
    sender: cliSender(),
    origin: cliOrigin(input.channel),
    command: `/${input.action}`,
  }));

  return {
    kind: "requested_reset",
    action: input.action,
    agentId: agent.id,
    channel: input.channel,
  };
}

export async function executeSessionThinkingAction(
  runtime: AppRuntime,
  input: {
    channel: string;
    level: ThinkingLevel;
    agentId?: string;
  },
): Promise<SessionThinkingResult> {
  const agent = runtime.getAgent(input.agentId);

  if (isLocalDirectChannel(input.channel)) {
    const { session } = await openDirectAgentSession({
      runtime,
      agentId: agent.id,
      channel: input.channel,
      sessionType: input.channel,
      thinking: input.level,
      cwd: process.cwd(),
    });

    try {
      return {
        kind: "local_thinking",
        agentId: agent.id,
        channel: input.channel,
        requestedLevel: input.level,
        effectiveLevel: session.thinkingLevel as ThinkingLevel,
      };
    } finally {
      session.dispose();
    }
  }

  runtime.createChannelBus().publish(sessionThinkingLevelMessageInput({
    channel: input.channel,
    targetAgentId: agent.id,
    level: input.level,
    sender: cliSender(),
    origin: cliOrigin(input.channel),
    command: "/thinking",
  }));

  return {
    kind: "requested_thinking",
    agentId: agent.id,
    channel: input.channel,
    level: input.level,
  };
}

function executeLocalSessionLifecycle(input: {
  action: SessionLifecycleAction;
  sessionDir: string;
  channel: string;
  agentId: string;
  archive?: string;
}): SessionLifecycleResult {
  if (input.action === "restore") {
    const restored = restoreArchivedSessionDir(input.sessionDir, input.archive);
    if (!restored) {
      throw new Error(
        input.archive
          ? `archive not found for ${input.agentId}/${input.channel}: ${input.archive}`
          : `no archived sessions for ${input.agentId}/${input.channel}`,
      );
    }

    return {
      kind: "local_restore",
      agentId: input.agentId,
      channel: input.channel,
      restoredFrom: restored.restoredFrom,
      archivedPreviousTo: restored.archivedPreviousTo,
    };
  }

  return {
    kind: "local_reset",
    agentId: input.agentId,
    channel: input.channel,
    archivedTo: archiveSessionDir(input.sessionDir),
  };
}

function summarizeSessionPath(path: string): SessionPathSummary {
  const exists = existsSync(path);
  return {
    name: basename(path),
    path,
    exists,
    updatedAt: exists ? new Date(statSync(path).mtimeMs).toISOString() : null,
  };
}

function summarizeActiveSessionPath(sessionDir: string): SessionPathSummary {
  const active = findActiveSessionFile(sessionDir);
  if (active) return summarizeSessionPath(active);

  return {
    name: basename(sessionDir),
    path: sessionDir,
    exists: false,
    updatedAt: null,
  };
}

function readRecordedCompactionPolicy(path: string): EffectiveCompactionPolicy | undefined {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (parsed.type !== "custom") continue;
    if (parsed.customType !== "shrimpy_compaction_policy") continue;
    return isEffectiveCompactionPolicy(parsed.data) ? parsed.data : undefined;
  }
  return undefined;
}

function readRecordedSessionRuntime(path: string): SessionCompactionPolicySummary["recordedSession"] {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (parsed.type !== "custom") continue;
    if (parsed.customType !== "shrimpy_session_metadata") continue;
    if (!isRecord(parsed.data)) return {};

    const env = isRecord(parsed.data.env) ? parsed.data.env : {};
    return {
      provider: typeof env.provider === "string" ? env.provider : undefined,
      id: typeof env.model_id === "string" ? env.model_id : undefined,
      bootedAt: typeof env.booted_at_iso === "string" ? env.booted_at_iso : undefined,
      inference: parseRecordedInference(parsed.data.inference),
    };
  }
  return undefined;
}

function compactionRestartReasons(input: {
  recordedPolicy: EffectiveCompactionPolicy | undefined;
  effectivePolicy: EffectiveCompactionPolicy;
  recordedSession: SessionCompactionPolicySummary["recordedSession"] | undefined;
  model?: Model<Api>;
  inference?: ModelVariantInference;
}): string[] {
  const reasons: string[] = [];
  if (input.recordedPolicy === undefined) {
    reasons.push("missing recorded compaction policy");
  } else if (!samePolicySettings(input.recordedPolicy, input.effectivePolicy)) {
    reasons.push("different compaction policy");
  }

  if (input.model || input.inference) {
    if (input.recordedSession === undefined) {
      reasons.push("missing recorded session model metadata");
    } else if (!sameRecordedSessionRuntime(input.recordedSession, input.model, input.inference)) {
      reasons.push("different session model or inference metadata");
    }
  }

  return reasons;
}

function compactionInspectionNote(input: {
  activeSessionExists: boolean;
  restartReasons: string[];
}): string {
  if (!input.activeSessionExists) {
    return "No active session file exists yet; this policy and model metadata will be used when the session opens.";
  }
  if (input.restartReasons.length === 0) {
    return "The active session records this effective compaction policy and session model metadata.";
  }
  return `The active session differs from current runtime settings (${input.restartReasons.join("; ")}); reset/reopen the session or restart the gateway to apply current settings.`;
}

function samePolicySettings(
  left: EffectiveCompactionPolicy,
  right: EffectiveCompactionPolicy,
): boolean {
  return left.enabled === right.enabled &&
    left.reserveTokens === right.reserveTokens &&
    left.thresholdTokens === right.thresholdTokens &&
    left.keepRecentTokens === right.keepRecentTokens &&
    left.instructions === right.instructions;
}

function sameRecordedSessionRuntime(
  recorded: NonNullable<SessionCompactionPolicySummary["recordedSession"]>,
  model: Model<Api> | undefined,
  inference: ModelVariantInference | undefined,
): boolean {
  if (model) {
    if (recorded.provider !== model.provider || recorded.id !== model.id) return false;
  } else if (recorded.provider !== undefined || recorded.id !== undefined) {
    return false;
  }

  return sameInference(recorded.inference, inference);
}

function sameInference(
  left: ModelVariantInference | undefined,
  right: ModelVariantInference | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.baseModel !== right.baseModel) return false;
  if (left.enableThinking !== right.enableThinking) return false;

  for (const name of INFERENCE_PARAM_NAMES) {
    if (left.params[name] !== right.params[name]) return false;
  }
  return true;
}

function parseRecordedInference(value: unknown): ModelVariantInference | undefined {
  if (!isRecord(value)) return undefined;

  const baseModel = value.baseModel;
  const enableThinking = value.enableThinking;
  const params = value.params;
  if (baseModel !== undefined && typeof baseModel !== "string") return undefined;
  if (enableThinking !== undefined && typeof enableThinking !== "boolean") return undefined;
  if (params !== undefined && !isRecord(params)) return undefined;

  const parsedParams: Partial<Record<InferenceParamName, number>> = {};
  if (isRecord(params)) {
    for (const name of INFERENCE_PARAM_NAMES) {
      const param = params[name];
      if (param === undefined) continue;
      if (typeof param !== "number" || !Number.isFinite(param)) return undefined;
      parsedParams[name] = param;
    }
  }

  return {
    baseModel,
    enableThinking,
    params: parsedParams,
  };
}

function isEffectiveCompactionPolicy(value: unknown): value is EffectiveCompactionPolicy {
  if (!isRecord(value)) return false;
  return typeof value.enabled === "boolean" &&
    typeof value.reserveTokens === "number" &&
    typeof value.keepRecentTokens === "number" &&
    Array.isArray(value.matched) &&
    value.matched.every((entry) => typeof entry === "string") &&
    (value.thresholdTokens === undefined || typeof value.thresholdTokens === "number") &&
    (value.instructions === undefined || typeof value.instructions === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cliSender() {
  return {
    kind: "system" as const,
    actorId: "system:cli",
    displayName: "shrimpy-cli",
  };
}

function cliOrigin(channel: string) {
  return {
    transport: "cli",
    sourceChannel: channel,
  };
}
