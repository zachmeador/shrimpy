import { randomUUID } from "node:crypto";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import { channelAgentIds } from "../channels/membership.js";
import { explainAgentMessageHandling } from "../agents/channel-policy.js";
import type { AgentAttentionRule, ResolvedAgentConfig } from "../config/agents.js";
import { createGatewaySessionDescriptor } from "../sessions/spec.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import {
  emitOneTimeScheduleRun,
  previewOneTimeScheduleMessage,
} from "./emit.js";
import type { ScheduleAttentionExpectation } from "./inspection.js";

export type OneTimeScheduleStatus =
  | "pending"
  | "fired"
  | "cancelled"
  | "failed"
  | "expired";

export interface OneTimeScheduleSource {
  kind: string;
  id?: string;
  agentId?: string;
  actorId?: string;
}

export interface OneTimeScheduleRecord {
  id: string;
  targetChannel: string;
  text: string;
  dueAtMs: number;
  dueAtIso: string;
  timezone?: string;
  ownerAgentId?: string;
  source: OneTimeScheduleSource;
  status: OneTimeScheduleStatus;
  createdAtMs: number;
  createdAtIso: string;
  updatedAtMs: number;
  updatedAtIso: string;
  firedAtMs?: number;
  firedAtIso?: string;
  emittedChannelMessageId?: string;
  runId?: string;
  cancelledAtMs?: number;
  cancelledAtIso?: string;
  cancellationReason?: string;
  failedAtMs?: number;
  failedAtIso?: string;
  failureMessage?: string;
}

export interface OneTimeScheduleStore {
  version: 1;
  records: OneTimeScheduleRecord[];
}

export interface CreateOneTimeScheduleInput {
  id?: string;
  targetChannel: string;
  text: string;
  dueAtMs: number;
  timezone?: string;
  ownerAgentId?: string;
  source?: Partial<OneTimeScheduleSource>;
}

export interface OneTimeScheduleInspection {
  kind: "one_time";
  id: string;
  source: {
    kind: "one_time";
    path: string;
    recordSource: OneTimeScheduleSource;
  };
  ownerAgentId?: string;
  status: OneTimeScheduleStatus;
  targetChannel: string;
  text: string;
  dueAtMs: number;
  dueAtIso: string;
  timezone?: string;
  createdAtMs: number;
  firedAtMs?: number;
  cancelledAtMs?: number;
  failedAtMs?: number;
  emittedChannelMessageId?: string;
  runId?: string;
  channelMembership: {
    exists: boolean;
    agentIds: string[];
  };
  expectedAttention: ScheduleAttentionExpectation[];
  expectedTurnAgentIds: string[];
  inspectCommands: {
    schedule: string;
    channel: string;
    membership: string;
    attention: string[];
    cancel?: string;
  };
  diagnostics: string[];
  record: OneTimeScheduleRecord;
}

export interface InspectOneTimeSchedulesOptions {
  agentId?: string;
  status?: OneTimeScheduleStatus;
}

export interface ParsedOneTimeDue {
  dueAtMs: number;
  dueAtIso: string;
}

const STORE_VERSION = 1;
const COMPLETED_HISTORY_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function parseSource(raw: unknown): OneTimeScheduleSource | undefined {
  if (!isRecord(raw) || typeof raw.kind !== "string") return undefined;
  return {
    kind: raw.kind,
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    ...(typeof raw.agentId === "string" ? { agentId: raw.agentId } : {}),
    ...(typeof raw.actorId === "string" ? { actorId: raw.actorId } : {}),
  };
}

function parseRecord(raw: unknown): OneTimeScheduleRecord | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.id !== "string") return undefined;
  if (typeof raw.targetChannel !== "string") return undefined;
  if (typeof raw.text !== "string") return undefined;
  if (typeof raw.dueAtMs !== "number") return undefined;
  if (typeof raw.dueAtIso !== "string") return undefined;
  if (!isOneTimeScheduleStatus(raw.status)) return undefined;
  if (typeof raw.createdAtMs !== "number") return undefined;
  if (typeof raw.createdAtIso !== "string") return undefined;
  if (typeof raw.updatedAtMs !== "number") return undefined;
  if (typeof raw.updatedAtIso !== "string") return undefined;

  const source = parseSource(raw.source) ?? { kind: "unknown" };
  return {
    id: raw.id,
    targetChannel: raw.targetChannel,
    text: raw.text,
    dueAtMs: raw.dueAtMs,
    dueAtIso: raw.dueAtIso,
    ...(typeof raw.timezone === "string" ? { timezone: raw.timezone } : {}),
    ...(typeof raw.ownerAgentId === "string" ? { ownerAgentId: raw.ownerAgentId } : {}),
    source,
    status: raw.status,
    createdAtMs: raw.createdAtMs,
    createdAtIso: raw.createdAtIso,
    updatedAtMs: raw.updatedAtMs,
    updatedAtIso: raw.updatedAtIso,
    ...(typeof raw.firedAtMs === "number" ? { firedAtMs: raw.firedAtMs } : {}),
    ...(typeof raw.firedAtIso === "string" ? { firedAtIso: raw.firedAtIso } : {}),
    ...(typeof raw.emittedChannelMessageId === "string"
      ? { emittedChannelMessageId: raw.emittedChannelMessageId }
      : {}),
    ...(typeof raw.runId === "string" ? { runId: raw.runId } : {}),
    ...(typeof raw.cancelledAtMs === "number" ? { cancelledAtMs: raw.cancelledAtMs } : {}),
    ...(typeof raw.cancelledAtIso === "string" ? { cancelledAtIso: raw.cancelledAtIso } : {}),
    ...(typeof raw.cancellationReason === "string"
      ? { cancellationReason: raw.cancellationReason }
      : {}),
    ...(typeof raw.failedAtMs === "number" ? { failedAtMs: raw.failedAtMs } : {}),
    ...(typeof raw.failedAtIso === "string" ? { failedAtIso: raw.failedAtIso } : {}),
    ...(typeof raw.failureMessage === "string" ? { failureMessage: raw.failureMessage } : {}),
  };
}

function parseStore(raw: unknown): OneTimeScheduleStore {
  if (!isRecord(raw) || raw.version !== STORE_VERSION || !Array.isArray(raw.records)) {
    return emptyStore();
  }
  return {
    version: STORE_VERSION,
    records: raw.records.flatMap((record) => {
      const parsed = parseRecord(record);
      return parsed ? [parsed] : [];
    }),
  };
}

function emptyStore(): OneTimeScheduleStore {
  return { version: STORE_VERSION, records: [] };
}

function isOneTimeScheduleStatus(value: unknown): value is OneTimeScheduleStatus {
  return value === "pending" ||
    value === "fired" ||
    value === "cancelled" ||
    value === "failed" ||
    value === "expired";
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

export function loadOneTimeScheduleStore(path: string): OneTimeScheduleStore {
  return readJsonFile(path, emptyStore, parseStore);
}

export function saveOneTimeScheduleStore(
  path: string,
  store: OneTimeScheduleStore,
): void {
  writeJsonFileAtomic(path, pruneStore(store));
}

export function createOneTimeScheduleRecord(
  input: CreateOneTimeScheduleInput,
  nowMs = Date.now(),
): OneTimeScheduleRecord {
  assertNonEmpty(input.targetChannel, "target channel");
  assertNonEmpty(input.text, "text");
  if (!Number.isFinite(input.dueAtMs)) {
    throw new Error("due time must be a finite timestamp");
  }

  return {
    id: input.id ?? `once-${randomUUID()}`,
    targetChannel: input.targetChannel,
    text: input.text,
    dueAtMs: input.dueAtMs,
    dueAtIso: iso(input.dueAtMs),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.ownerAgentId ? { ownerAgentId: input.ownerAgentId } : {}),
    source: {
      kind: input.source?.kind ?? "cli",
      ...(input.source?.id ? { id: input.source.id } : {}),
      ...(input.source?.agentId ? { agentId: input.source.agentId } : {}),
      ...(input.source?.actorId ? { actorId: input.source.actorId } : {}),
    },
    status: "pending",
    createdAtMs: nowMs,
    createdAtIso: iso(nowMs),
    updatedAtMs: nowMs,
    updatedAtIso: iso(nowMs),
  };
}

export function addOneTimeSchedule(
  path: string,
  input: CreateOneTimeScheduleInput,
  nowMs = Date.now(),
): OneTimeScheduleRecord {
  const store = loadOneTimeScheduleStore(path);
  const record = createOneTimeScheduleRecord(input, nowMs);
  if (store.records.some((existing) => existing.id === record.id)) {
    throw new Error(`one-time schedule already exists: ${record.id}`);
  }
  store.records.push(record);
  saveOneTimeScheduleStore(path, store);
  return record;
}

export function cancelOneTimeSchedule(
  path: string,
  id: string,
  opts: {
    reason?: string;
    nowMs?: number;
  } = {},
): OneTimeScheduleRecord {
  const store = loadOneTimeScheduleStore(path);
  const record = store.records.find((candidate) => candidate.id === id);
  if (!record) {
    throw new Error(`one-time schedule not found: ${id}`);
  }
  if (record.status !== "pending") {
    throw new Error(
      `one-time schedule ${id} cannot be cancelled from status ${record.status}`,
    );
  }
  const nowMs = opts.nowMs ?? Date.now();
  record.status = "cancelled";
  record.cancelledAtMs = nowMs;
  record.cancelledAtIso = iso(nowMs);
  if (opts.reason) record.cancellationReason = opts.reason;
  record.updatedAtMs = nowMs;
  record.updatedAtIso = iso(nowMs);
  saveOneTimeScheduleStore(path, store);
  return record;
}

export function parseOneTimeDue(
  input: {
    at?: string;
    in?: string;
    nowMs?: number;
  },
): ParsedOneTimeDue {
  const hasAt = typeof input.at === "string";
  const hasIn = typeof input.in === "string";
  if (hasAt === hasIn) {
    throw new Error("provide exactly one of --at or --in");
  }

  if (hasAt) {
    const parsed = Date.parse(input.at!);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        "--at must be an ISO-like timestamp parseable by Date.parse",
      );
    }
    return {
      dueAtMs: parsed,
      dueAtIso: iso(parsed),
    };
  }

  const durationMs = parseDurationMs(input.in!);
  const dueAtMs = (input.nowMs ?? Date.now()) + durationMs;
  return {
    dueAtMs,
    dueAtIso: iso(dueAtMs),
  };
}

export function parseDurationMs(input: string): number {
  const normalized = input.trim().toLowerCase().replaceAll(/\s+/g, "");
  if (!normalized) throw new Error("--in duration must be non-empty");

  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)(seconds|second|secs|sec|minutes|minute|mins|min|hours|hour|hrs|hr|days|day|weeks|week|ms|s|m|h|d|w)/g)];
  if (matches.length === 0) {
    throw new Error("--in duration must use units like 30s, 20m, 2h, or 1d");
  }

  const consumed = matches.map((match) => match[0]).join("");
  if (consumed !== normalized) {
    throw new Error("--in duration must use units like 30s, 20m, 2h, or 1d");
  }

  let total = 0;
  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unitMultiplierMs(unit);
    total += amount * multiplier;
  }
  if (!(total > 0)) {
    throw new Error("--in duration must be greater than zero");
  }
  return Math.round(total);
}

export function inspectOneTimeSchedules(
  runtime: AppRuntime,
  opts: InspectOneTimeSchedulesOptions = {},
): OneTimeScheduleInspection[] {
  if (opts.agentId) runtime.getAgent(opts.agentId);

  const store = loadOneTimeScheduleStore(runtime.paths.oneTimeSchedulesPath);
  const membershipStore = runtime.createChannelMembershipStore();
  return store.records
    .filter((record) => !opts.agentId || record.ownerAgentId === opts.agentId)
    .filter((record) => !opts.status || record.status === opts.status)
    .sort(compareOneTimeRecords)
    .map((record) => {
      const membership = membershipStore.get(record.targetChannel);
      const memberAgentIds = membership ? channelAgentIds(membership) : [];
      const expectedAttention = inspectExpectedAttention(
        runtime,
        record,
        memberAgentIds,
      );
      const expectedTurnAgentIds = expectedAttention
        .filter((agent) => agent.handles)
        .map((agent) => agent.agentId);
      const diagnostics = oneTimeDiagnostics({
        record,
        membershipExists: membership !== null,
        memberAgentIds,
        expectedTurnAgentIds,
      });

      return {
        kind: "one_time",
        id: record.id,
        source: {
          kind: "one_time",
          path: runtime.paths.oneTimeSchedulesPath,
          recordSource: record.source,
        },
        ...(record.ownerAgentId ? { ownerAgentId: record.ownerAgentId } : {}),
        status: record.status,
        targetChannel: record.targetChannel,
        text: record.text,
        dueAtMs: record.dueAtMs,
        dueAtIso: record.dueAtIso,
        ...(record.timezone ? { timezone: record.timezone } : {}),
        createdAtMs: record.createdAtMs,
        ...(record.firedAtMs !== undefined ? { firedAtMs: record.firedAtMs } : {}),
        ...(record.cancelledAtMs !== undefined
          ? { cancelledAtMs: record.cancelledAtMs }
          : {}),
        ...(record.failedAtMs !== undefined ? { failedAtMs: record.failedAtMs } : {}),
        ...(record.emittedChannelMessageId
          ? { emittedChannelMessageId: record.emittedChannelMessageId }
          : {}),
        ...(record.runId ? { runId: record.runId } : {}),
        channelMembership: {
          exists: membership !== null,
          agentIds: memberAgentIds,
        },
        expectedAttention,
        expectedTurnAgentIds,
        inspectCommands: {
          schedule: `shrimpy schedules show ${record.id}`,
          channel: `shrimpy channels show ${record.targetChannel}`,
          membership: `shrimpy channels members ${record.targetChannel}`,
          attention: expectedAttention.map((agent) => agent.inspectCommand),
          ...(record.status === "pending"
            ? { cancel: `shrimpy schedules cancel ${record.id}` }
            : {}),
        },
        diagnostics,
        record,
      };
    });
}

export function inspectOneTimeSchedule(
  runtime: AppRuntime,
  id: string,
): OneTimeScheduleInspection {
  const match = inspectOneTimeSchedules(runtime).find((schedule) => schedule.id === id);
  if (!match) throw new Error(`one-time schedule not found: ${id}`);
  return match;
}

export function drainDueOneTimeSchedules(
  opts: {
    storePath: string;
    channelBus: ChannelBus;
    nowMs?: number;
  },
): OneTimeScheduleRecord[] {
  const nowMs = opts.nowMs ?? Date.now();
  const store = loadOneTimeScheduleStore(opts.storePath);
  const fired: OneTimeScheduleRecord[] = [];
  let changed = false;

  for (const record of store.records) {
    if (record.status !== "pending" || record.dueAtMs > nowMs) continue;
    const runId = randomUUID();
    try {
      const message = emitOneTimeScheduleRun(opts.channelBus, {
        record,
        runId,
        fireTimeMs: nowMs,
        fireTimeIso: iso(nowMs),
      });
      record.status = "fired";
      record.firedAtMs = nowMs;
      record.firedAtIso = iso(nowMs);
      record.emittedChannelMessageId = message.id;
      record.runId = runId;
      record.updatedAtMs = nowMs;
      record.updatedAtIso = iso(nowMs);
      fired.push(record);
    } catch (err) {
      record.status = "failed";
      record.failedAtMs = nowMs;
      record.failedAtIso = iso(nowMs);
      record.failureMessage = err instanceof Error ? err.message : String(err);
      record.updatedAtMs = nowMs;
      record.updatedAtIso = iso(nowMs);
    }
    changed = true;
  }

  if (changed) saveOneTimeScheduleStore(opts.storePath, store);
  return fired;
}

function unitMultiplierMs(unit: string): number {
  switch (unit) {
    case "ms":
      return 1;
    case "s":
    case "sec":
    case "secs":
    case "second":
    case "seconds":
      return 1_000;
    case "m":
    case "min":
    case "mins":
    case "minute":
    case "minutes":
      return 60_000;
    case "h":
    case "hr":
    case "hrs":
    case "hour":
    case "hours":
      return 3_600_000;
    case "d":
    case "day":
    case "days":
      return 86_400_000;
    case "w":
    case "week":
    case "weeks":
      return 604_800_000;
    default:
      throw new Error(`unknown duration unit: ${unit}`);
  }
}

function inspectExpectedAttention(
  runtime: AppRuntime,
  record: OneTimeScheduleRecord,
  memberAgentIds: string[],
): ScheduleAttentionExpectation[] {
  return memberAgentIds.flatMap((agentId) => {
    const agent = findAgent(runtime, agentId);
    if (!agent) return [];
    const message = previewOneTimeScheduleMessage(record);
    const explanation = explainAgentMessageHandling(agent, record.targetChannel, message);
    return [{
      agentId: agent.id,
      member: memberAgentIds.includes(agent.id),
      handles: explanation.handles,
      reason: explanation.reason,
      ...(explanation.impliedRule ? { impliedRule: explanation.impliedRule } : {}),
      ...(explanation.effectiveAttention
        ? { effectiveAttention: explanation.effectiveAttention as Required<AgentAttentionRule> }
        : {}),
      sessionPath: createGatewaySessionDescriptor({
        workspacePath: runtime.getAgentPaths(agent.id).root,
        agentId: agent.id,
        channel: record.targetChannel,
      }).sessionDir,
      inspectCommand: attentionInspectCommand(agent.id, record),
    }];
  });
}

function attentionInspectCommand(
  agentId: string,
  record: OneTimeScheduleRecord,
): string {
  return [
    "shrimpy agent attention test",
    shellQuote(agentId),
    "--channel",
    shellQuote(record.targetChannel),
    "--sender",
    "system",
    "--actor-id",
    "system:scheduler",
    "--text",
    shellQuote(record.text),
  ].join(" ");
}

function oneTimeDiagnostics(input: {
  record: OneTimeScheduleRecord;
  membershipExists: boolean;
  memberAgentIds: string[];
  expectedTurnAgentIds: string[];
}): string[] {
  const diagnostics: string[] = [];
  const { record } = input;

  if (!input.membershipExists) {
    diagnostics.push(`target channel ${record.targetChannel} has no explicit membership`);
  }
  if (input.membershipExists && input.memberAgentIds.length === 0) {
    diagnostics.push(`target channel ${record.targetChannel} has no agent members`);
  }
  if (record.status === "pending" && input.expectedTurnAgentIds.length === 0) {
    diagnostics.push(
      "no configured agent is expected to take a turn from this scheduled message",
    );
  }
  if (record.status === "pending" && record.dueAtMs <= Date.now()) {
    diagnostics.push("one-time schedule is due or overdue");
  }
  if (record.status === "fired" && !record.emittedChannelMessageId) {
    diagnostics.push("fired one-time schedule has no emitted channel message id");
  }
  if (record.status === "failed" && record.failureMessage) {
    diagnostics.push(`last fire attempt failed: ${record.failureMessage}`);
  }

  return diagnostics;
}

function pruneStore(store: OneTimeScheduleStore): OneTimeScheduleStore {
  const pending = store.records.filter((record) => record.status === "pending");
  const terminal = store.records
    .filter((record) => record.status !== "pending")
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, COMPLETED_HISTORY_LIMIT)
    .sort(compareOneTimeRecords);
  return {
    version: STORE_VERSION,
    records: [...pending.sort(compareOneTimeRecords), ...terminal],
  };
}

function compareOneTimeRecords(
  a: OneTimeScheduleRecord,
  b: OneTimeScheduleRecord,
): number {
  if (a.status === "pending" && b.status === "pending") {
    return a.dueAtMs - b.dueAtMs || a.createdAtMs - b.createdAtMs;
  }
  if (a.status === "pending") return -1;
  if (b.status === "pending") return 1;
  return b.updatedAtMs - a.updatedAtMs;
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
