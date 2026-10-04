import { readFileSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AppRuntime } from "../../app/runtime.js";
import { isRecord } from "../../util/record.js";
import {
  resolveSessionCompactionPolicy,
  type EffectiveCompactionPolicy,
} from "./policy.js";
import { formatSessionId, parseSessionId, sameSessionKey } from "../identity.js";
import { createSessionDescriptor } from "../spec.js";
import {
  summarizeActiveSessionPath,
  type SessionPathSummary,
} from "../path-summary.js";
import {
  findLastCustomEntry,
} from "../transcript-store.js";
import {
  listSessionDescriptors,
} from "../manifest.js";

export interface SessionCompactionPolicySummary {
  agentId: string;
  sessionId: string;
  purpose: string;
  sessionDir: string;
  activeSession: SessionPathSummary;
  model?: {
    provider: string;
    id: string;
    contextWindow?: number;
  };
  effective: EffectiveCompactionPolicy;
  recorded?: EffectiveCompactionPolicy;
  recordedSession?: {
    provider?: string;
    id?: string;
    bootedAt?: string;
  };
  restartRequired: boolean;
  note: string;
}

export async function inspectSessionCompactionPolicy(
  runtime: AppRuntime,
  input: {
    sessionId: string;
    agentId?: string;
  },
): Promise<SessionCompactionPolicySummary> {
  const agent = runtime.getAgent(input.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const key = parseSessionId(agent.id, input.sessionId);
  const descriptor = listSessionDescriptors(agentRoot).find((candidate) =>
    sameSessionKey(candidate.key, key)
  ) ?? createSessionDescriptor({
    agentRoot,
    key,
    purpose: key.namespace === "channel" ? "channel" : key.namespace,
    delivery: key.namespace === "channel"
      ? { kind: "channel", channel: key.name }
      : { kind: "transcript" },
  });
  if (descriptor.storage.kind !== "durable") {
    throw new Error(`session ${input.sessionId} is not durable`);
  }

  const bootstrap = await runtime.createBootstrap({ agentId: agent.id });
  const model = runtime.resolveModel(
    bootstrap,
    undefined,
    undefined,
    agent.modelPolicy,
    { allowMissingDefault: true },
  );
  const effective = resolveSessionCompactionPolicy({
    runtimeConfig: runtime.resolved.runtime,
    descriptor,
    model,
  });
  const activeSession = summarizeActiveSessionPath(descriptor.storage.dir);
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
    })
    : [];
  const restartRequired = restartReasons.length > 0;
  const note = compactionInspectionNote({
    activeSessionExists: activeSession.exists,
    restartReasons,
  });

  return {
    agentId: agent.id,
    sessionId: formatSessionId(key),
    purpose: descriptor.purpose,
    sessionDir: descriptor.storage.dir,
    activeSession,
    model: model
      ? {
        provider: model.provider,
        id: model.id,
        contextWindow: model.contextWindow,
      }
      : undefined,
    effective,
    recorded,
    recordedSession,
    restartRequired,
    note,
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
  };
}

function compactionRestartReasons(input: {
  recordedPolicy: EffectiveCompactionPolicy | undefined;
  effectivePolicy: EffectiveCompactionPolicy;
  recordedSession: SessionCompactionPolicySummary["recordedSession"] | undefined;
  model?: Model<Api>;
}): string[] {
  const reasons: string[] = [];
  if (input.recordedPolicy === undefined) {
    reasons.push("missing recorded compaction policy");
  } else if (!samePolicySettings(input.recordedPolicy, input.effectivePolicy)) {
    reasons.push("different compaction policy");
  }

  if (input.model) {
    if (input.recordedSession === undefined) {
      reasons.push("missing recorded session model metadata");
    } else if (!sameRecordedSessionRuntime(input.recordedSession, input.model)) {
      reasons.push("different session model metadata");
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
): boolean {
  if (model) {
    if (recorded.provider !== model.provider || recorded.id !== model.id) return false;
  } else if (recorded.provider !== undefined || recorded.id !== undefined) {
    return false;
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
