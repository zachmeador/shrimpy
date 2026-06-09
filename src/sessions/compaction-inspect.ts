import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AppRuntime } from "../app/runtime.js";
import {
  INFERENCE_PARAM_NAMES,
  parseModelVariantInference,
  resolveModelVariantInference,
  type ModelVariantInference,
} from "../inference/params.js";
import { isRecord } from "../util/record.js";
import {
  resolveSessionCompactionPolicy,
  type EffectiveCompactionPolicy,
} from "./compaction-policy.js";
import { isLocalDirectChannel } from "./direct-channels.js";
import { createGatewaySessionDescriptor } from "./spec.js";
import {
  findActiveSessionFile,
  findLastCustomEntry,
} from "./storage.js";

interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
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
    agent.modelPolicy,
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
  const entry = findLastCustomEntry(lines, "shrimpy_compaction_policy");
  return isEffectiveCompactionPolicy(entry?.data) ? entry.data : undefined;
}

function readRecordedSessionRuntime(path: string): SessionCompactionPolicySummary["recordedSession"] {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
  const entry = findLastCustomEntry(lines, "shrimpy_session_metadata");
  if (!entry) return undefined;
  if (!isRecord(entry.data)) return {};

  const env = isRecord(entry.data.env) ? entry.data.env : {};
  return {
    provider: typeof env.provider === "string" ? env.provider : undefined,
    id: typeof env.model_id === "string" ? env.model_id : undefined,
    bootedAt: typeof env.booted_at_iso === "string" ? env.booted_at_iso : undefined,
    inference: parseModelVariantInference(entry.data.inference),
  };
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
