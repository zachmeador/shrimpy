import { evaluateAgentChannelPolicy } from "../agents/channel-policy.js";
import { shrimpyRuntimeChildEnv } from "../app/environment.js";
import type { AppRuntime } from "../app/runtime.js";
import { makeMessage, type ChannelMessage } from "../channels/protocol.js";
import { textContent } from "../channels/messages.js";
import { channelAgentIds } from "../channels/membership.js";
import type {
  AgentChannelPolicyRule,
  ResolvedAgentConfig,
} from "../config/agents.js";
import { createChannelSessionKey, sessionRootPath } from "../sessions/identity.js";
import {
  computeNextWatchRunAtMs,
} from "./clock.js";
import {
  loadWatchClockState,
} from "./clock-state.js";
import {
  loadActiveWatchRuns,
  loadWatchRunHistory,
  type ActiveWatchRunRecord,
  type WatchRunRecord,
} from "./runs.js";
import {
  loadAgentWatchDefinitions,
  resolveAgentWatchDefinition,
  watchDefinitionDiagnostics,
  watchTriggerText,
  type ResolvedAgentWatchDefinition,
  type WatchEmitPolicy,
} from "./schema.js";
import {
  createWatchLoadError,
  loadWatchLoadErrors,
  type WatchLoadError,
} from "./load-errors.js";
import { runWatchDue } from "./runner.js";

export interface WatchWakeExpectation {
  channel: string;
  agentId: string;
  member: boolean;
  action: "wake" | "ignore";
  reason: string;
  policyOwner: "agent";
  effectivePolicy?: Required<AgentChannelPolicyRule>;
  runtimeGuard?: string;
  sessionPath: string;
  inspectCommand: string;
}

export interface WatchInspection {
  id: string;
  name?: string;
  source: {
    kind: "agent";
    path: string;
  };
  ownerAgentId: string;
  localId: string;
  enabled: boolean;
  triggerText: string;
  concurrencyPolicy: "forbid" | "allow";
  actionKind: "command" | "message";
  emitPolicy: WatchEmitPolicy | "message";
  targetChannels: string[];
  expectedWake: WatchWakeExpectation[];
  expectedTurnAgentIds: string[];
  nextRunAtMs?: number;
  nextRunSource?: "clock_state" | "computed";
  activeRun?: ActiveWatchRunRecord;
  lastRun?: WatchRunRecord;
  inspectCommands: {
    watch: string;
    history: string;
    run: string;
    channels: string[];
    wake: string[];
  };
  diagnostics: string[];
  watch: ResolvedAgentWatchDefinition;
}

interface InspectWatchesOptions {
  agentId?: string;
}

interface WatchInspectionEntry {
  watch: ResolvedAgentWatchDefinition;
  sourcePath: string;
}

export function inspectWatches(
  runtime: AppRuntime,
  opts: InspectWatchesOptions = {},
): WatchInspection[] {
  if (opts.agentId) runtime.getAgent(opts.agentId);

  const entries = loadWatchInspectionEntries(runtime).entries
    .filter((entry) => !opts.agentId || entry.watch.ownerAgentId === opts.agentId);
  const watchClockState = loadWatchClockState(runtime.paths.watchClockStatePath);
  const memberships = runtime.createChannelMembershipStore();

  return entries.map((entry) => {
    const watch = entry.watch;
    const targetChannels = watchTargetChannels(watch);
    const expectedWake = targetChannels.flatMap((channel) => {
      const membership = memberships.get(channel);
      const memberAgentIds = membership ? channelAgentIds(membership) : [];
      return inspectExpectedWake(runtime, watch, channel, memberAgentIds);
    });
    const expectedTurnAgentIds = [...new Set(
      expectedWake
        .filter((agent) => agent.action === "wake")
        .map((agent) => agent.agentId),
    )];
    const activeRun = loadActiveWatchRuns(
      runtime.paths.runtimeWatchesDir,
      watch.ownerAgentId,
    )[watch.id];
    const lastRun = loadWatchRunHistory(runtime.paths.runtimeWatchesDir, watch.ownerAgentId, {
      watchId: watch.id,
      limit: 1,
    })[0];
    const persistedNextRunAtMs = watchClockState[watch.id]?.nextRunAtMs;
    const computedNextRunAtMs = persistedNextRunAtMs === undefined && watch.enabled !== false
      ? computeFallbackNextRunAtMs(runtime, watch)
      : undefined;
    const nextRunAtMs = persistedNextRunAtMs ?? computedNextRunAtMs;
    const nextRunSource = persistedNextRunAtMs !== undefined
      ? "clock_state"
      : computedNextRunAtMs !== undefined
        ? "computed"
        : undefined;

    return {
      id: watch.id,
      ...(watch.name ? { name: watch.name } : {}),
      source: {
        kind: "agent",
        path: entry.sourcePath,
      },
      ownerAgentId: watch.ownerAgentId,
      localId: watch.localId,
      enabled: watch.enabled !== false,
      triggerText: watchTriggerText(watch.trigger),
      concurrencyPolicy: watch.concurrencyPolicy ?? "forbid",
      actionKind: watch.action.kind,
      emitPolicy: watch.action.kind === "message"
        ? "message"
        : watch.emit?.policy ?? "never",
      targetChannels,
      expectedWake,
      expectedTurnAgentIds,
      ...(nextRunAtMs !== undefined ? { nextRunAtMs } : {}),
      ...(nextRunSource ? { nextRunSource } : {}),
      ...(activeRun ? { activeRun } : {}),
      ...(lastRun ? { lastRun } : {}),
      inspectCommands: {
        watch: `shrimpy watches show ${watch.id}`,
        history: `shrimpy watches history ${watch.id}`,
        run: `shrimpy watches run ${watch.id}`,
        channels: targetChannels.map((channel) => `shrimpy channels show ${channel}`),
        wake: expectedWake.map((agent) => agent.inspectCommand),
      },
      diagnostics: watchDiagnostics({
        watch,
        targetChannels,
        expectedTurnAgentIds,
        nextRunSource,
        nextRunComputed: computedNextRunAtMs !== undefined,
        lastRun,
      }),
      watch,
    };
  });
}

export function inspectWatchLoadErrors(
  runtime: AppRuntime,
  opts: InspectWatchesOptions = {},
): WatchLoadError[] {
  if (opts.agentId) runtime.getAgent(opts.agentId);

  const current = loadWatchInspectionEntries(runtime).errors;
  const byAgent = new Map(
    loadWatchLoadErrors(runtime).map((error) => [error.agentId, error]),
  );
  for (const error of current) byAgent.set(error.agentId, error);
  return [...byAgent.values()]
    .filter((error) => !opts.agentId || error.agentId === opts.agentId)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));
}

function computeFallbackNextRunAtMs(
  runtime: AppRuntime,
  watch: ResolvedAgentWatchDefinition,
): number | undefined {
  try {
    return computeNextWatchRunAtMs(
      watch,
      Date.now(),
      runtime.config.watchClock?.defaultTimezone,
    );
  } catch {
    return undefined;
  }
}

export function inspectWatch(
  runtime: AppRuntime,
  watchId: string,
): WatchInspection {
  const match = inspectWatches(runtime).find((watch) => watch.id === watchId);
  if (!match) throw new Error(`watch not found: ${watchId}`);
  return match;
}

export function inspectWatchHistory(
  runtime: AppRuntime,
  watchId: string,
  opts: {
    limit?: number;
  } = {},
): WatchRunRecord[] {
  const watch = inspectWatch(runtime, watchId);
  return loadWatchRunHistory(runtime.paths.runtimeWatchesDir, watch.ownerAgentId, {
    watchId,
    limit: opts.limit,
  });
}

export async function runWatchNow(
  runtime: AppRuntime,
  watchId: string,
): Promise<WatchRunRecord> {
  const watch = inspectWatch(runtime, watchId).watch;
  const nowMs = Date.now();
  return runWatchDue({
    run: {
      watch,
      watchId: watch.id,
      runId: crypto.randomUUID(),
      fireTimeMs: nowMs,
      fireTimeIso: new Date(nowMs).toISOString(),
      dedupeKey: `${watch.id}:manual:${nowMs}`,
    },
    channelBus: runtime.createChannelBus(),
    runStoreRoot: runtime.paths.runtimeWatchesDir,
    env: shrimpyRuntimeChildEnv(runtime.paths.workspace),
    logger: console,
  });
}

function loadWatchInspectionEntries(runtime: AppRuntime): {
  entries: WatchInspectionEntry[];
  errors: WatchLoadError[];
} {
  const entries: WatchInspectionEntry[] = [];
  const errors: WatchLoadError[] = [];
  for (const agent of runtime.resolved.agents) {
    const watchesPath = runtime.getAgentPaths(agent.id).watchesPath;
    try {
      for (const watch of loadAgentWatchDefinitions(watchesPath)) {
        entries.push({
          watch: resolveAgentWatchDefinition(agent.id, watch),
          sourcePath: watchesPath,
        });
      }
    } catch {
      errors.push(createWatchLoadError(agent.id, watchesPath));
    }
  }
  return { entries, errors };
}

function watchTargetChannels(watch: ResolvedAgentWatchDefinition): string[] {
  if (watch.action.kind === "message") return [watch.action.channel];
  if (watch.emit && watch.emit.policy !== "never" && watch.emit.channel) {
    return [watch.emit.channel];
  }
  return [];
}

function inspectExpectedWake(
  runtime: AppRuntime,
  watch: ResolvedAgentWatchDefinition,
  channel: string,
  memberAgentIds: string[],
): WatchWakeExpectation[] {
  const message = sampleWatchMessage(watch, channel);
  return memberAgentIds.flatMap((agentId) => {
    const agent = findAgent(runtime, agentId);
    if (!agent) return [];
    const decision = evaluateAgentChannelPolicy(agent, channel, message, {
      visible: true,
    });
    return [{
      channel,
      agentId: agent.id,
      member: memberAgentIds.includes(agent.id),
      action: decision.action,
      reason: decision.reason,
      policyOwner: decision.policyOwner,
      ...(decision.effectivePolicy ? { effectivePolicy: decision.effectivePolicy } : {}),
      ...(decision.runtimeGuard ? { runtimeGuard: decision.runtimeGuard } : {}),
      sessionPath: sessionRootPath(
        runtime.getAgentPaths(agent.id).root,
        createChannelSessionKey({ agentId: agent.id, channel }),
      ),
      inspectCommand: wakeInspectCommand(agent.id, channel, message),
    }];
  });
}

function sampleWatchMessage(
  watch: ResolvedAgentWatchDefinition,
  channel: string,
): ChannelMessage {
  const text = watch.action.kind === "message"
    ? watch.action.text
    : `[watch ${watch.id}]`;
  return makeMessage({
    id: "watch-inspection",
    timestamp: 0,
    sender: {
      kind: "system",
      actorId: "system:watch-runner",
    },
    origin: {
      transport: "watch",
      sourceChannel: channel,
      watchId: watch.id,
      runId: "watch-inspection",
      addressedAgentId: watch.action.kind === "message"
        ? watch.action.addressedAgentId
        : watch.emit?.addressedAgentId,
      watch: {
        kind: "recurring",
        ownerAgentId: watch.ownerAgentId,
        localId: watch.localId,
        targetChannel: channel,
        actionKind: watch.action.kind,
        inspect: [`shrimpy watches show ${watch.id}`],
      },
    },
    content: textContent(text),
  });
}

function watchDiagnostics(input: {
  watch: ResolvedAgentWatchDefinition;
  targetChannels: string[];
  expectedTurnAgentIds: string[];
  nextRunSource?: "clock_state" | "computed";
  nextRunComputed: boolean;
  lastRun?: WatchRunRecord;
}): string[] {
  const diagnostics: string[] = watchDefinitionDiagnostics(input.watch);
  if (input.watch.enabled === false) {
    diagnostics.push("watch is disabled");
  }
  if (input.targetChannels.length === 0) {
    diagnostics.push("watch records run history without emitting channel messages");
  }
  if (input.watch.enabled !== false && input.nextRunSource !== "clock_state") {
    diagnostics.push(input.nextRunComputed
      ? "watch clock has no next run recorded yet; computed fallback shown"
      : "watch clock has no next run recorded yet");
  }
  if (input.targetChannels.length > 0 && input.expectedTurnAgentIds.length === 0) {
    diagnostics.push("no configured agent is expected to take a turn from emitted watch messages");
  }
  if (!input.lastRun) {
    diagnostics.push("no watch run history recorded yet");
  }
  if (input.lastRun?.status === "failure" && input.lastRun.error) {
    diagnostics.push(`last run failed: ${input.lastRun.error}`);
  }
  return diagnostics;
}

function wakeInspectCommand(
  agentId: string,
  channel: string,
  message: ChannelMessage,
): string {
  const text = message.content.type === "text"
    ? message.content.data.text
    : JSON.stringify(message.content.data);
  return [
    "shrimpy agent channel-policy explain",
    shellQuote(agentId),
    "--channel",
    shellQuote(channel),
    "--sender",
    message.sender.kind,
    "--actor-id",
    shellQuote(message.sender.actorId),
    message.origin.addressedAgentId
      ? `--addressed ${shellQuote(message.origin.addressedAgentId)}`
      : "",
    "--text",
    shellQuote(text),
  ].filter(Boolean).join(" ");
}

function findAgent(
  runtime: AppRuntime,
  agentId: string,
): ResolvedAgentConfig | undefined {
  try {
    return runtime.getAgent(agentId);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown agent:")) {
      return undefined;
    }
    throw err;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
