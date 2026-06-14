import { dirname, join } from "node:path";
import { isRecord } from "../util/record.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";

export type GatewayLaneOutcome = "completed" | "errored" | "aborted";

export interface GatewayLaneTurnState {
  messageId: string;
  startedAt: number;
}

export interface GatewayLaneOutcomeState {
  messageId: string;
  outcome: GatewayLaneOutcome;
  at: number;
  error?: string;
}

export interface GatewayLaneState {
  agentId: string;
  channel: string;
  queueDepth: number;
  currentTurn?: GatewayLaneTurnState;
  lastOutcome?: GatewayLaneOutcomeState;
}

export interface GatewayLoopGuardTrip {
  agentId: string;
  channel: string;
  messageId: string;
  reason: string;
  at: number;
}

export interface GatewayRuntimeState {
  version: 1;
  updatedAt: number;
  handled: Record<string, Record<string, Record<string, number>>>;
  lanes: Record<string, Record<string, GatewayLaneState>>;
  loopGuards: GatewayLoopGuardTrip[];
}

interface RuntimePathLike {
  gatewayStatePath?: string;
  runtimeDir?: string;
  cursorsPath: string;
}

const MAX_HANDLED_PER_LANE = 1000;
const MAX_LOOP_GUARD_TRIPS = 100;
const EXPECTED_NON_REPORTABLE_GUARD_REASONS = new Set([
  "self-authored agent messages are not re-offered to the same agent",
  "surface addressing status messages do not wake agents",
]);

export function gatewayRuntimeStatePath(paths: RuntimePathLike): string {
  return paths.gatewayStatePath
    ?? join(paths.runtimeDir ?? dirname(paths.cursorsPath), "gateway-state.json");
}

export function emptyGatewayRuntimeState(): GatewayRuntimeState {
  return {
    version: 1,
    updatedAt: Date.now(),
    handled: {},
    lanes: {},
    loopGuards: [],
  };
}

export function loadGatewayRuntimeState(path: string): GatewayRuntimeState {
  return readJsonFile(path, emptyGatewayRuntimeState, parseGatewayRuntimeState);
}

export function saveGatewayRuntimeState(
  path: string,
  state: GatewayRuntimeState,
): void {
  writeJsonFileAtomic(path, state);
}

export class GatewayRuntimeStateStore {
  private state: GatewayRuntimeState;

  constructor(private readonly path: string) {
    this.state = loadGatewayRuntimeState(path);
  }

  snapshot(): GatewayRuntimeState {
    return structuredClone(this.state);
  }

  hasHandled(agentId: string, channel: string, messageId: string): boolean {
    return this.state.handled[agentId]?.[channel]?.[messageId] !== undefined;
  }

  markHandled(agentId: string, channel: string, messageId: string): void {
    const channels = this.state.handled[agentId] ?? {};
    const messages = channels[channel] ?? {};
    messages[messageId] = Date.now();
    channels[channel] = pruneRecord(messages, MAX_HANDLED_PER_LANE);
    this.state.handled[agentId] = channels;
    this.persist();
  }

  recordLane(lane: GatewayLaneState): void {
    const agentLanes = this.state.lanes[lane.agentId] ?? {};
    agentLanes[lane.channel] = lane;
    this.state.lanes[lane.agentId] = agentLanes;
    this.persist();
  }

  recordLoopGuardTrip(input: Omit<GatewayLoopGuardTrip, "at">): void {
    this.state.loopGuards = [
      ...this.state.loopGuards,
      { ...input, at: Date.now() },
    ].slice(-MAX_LOOP_GUARD_TRIPS);
    this.persist();
  }

  persist(): void {
    this.state.updatedAt = Date.now();
    saveGatewayRuntimeState(this.path, this.state);
  }
}

export function flattenGatewayLanes(
  state: GatewayRuntimeState,
  opts?: {
    agentId?: string;
    channel?: string;
  },
): GatewayLaneState[] {
  return Object.values(state.lanes)
    .flatMap((channels) => Object.values(channels))
    .filter((lane) =>
      (opts?.agentId === undefined || lane.agentId === opts.agentId)
      && (opts?.channel === undefined || lane.channel === opts.channel)
    )
    .sort((a, b) =>
      a.agentId.localeCompare(b.agentId) || a.channel.localeCompare(b.channel)
    );
}

function parseGatewayRuntimeState(raw: unknown): GatewayRuntimeState {
  if (!isRecord(raw)) return emptyGatewayRuntimeState();
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    handled: parseHandled(raw.handled),
    lanes: parseLanes(raw.lanes),
    loopGuards: parseLoopGuards(raw.loopGuards),
  };
}

function parseHandled(raw: unknown): GatewayRuntimeState["handled"] {
  if (!isRecord(raw)) return {};
  const handled: GatewayRuntimeState["handled"] = {};
  for (const [agentId, channelValue] of Object.entries(raw)) {
    if (!isRecord(channelValue)) continue;
    const channels: Record<string, Record<string, number>> = {};
    for (const [channel, messageValue] of Object.entries(channelValue)) {
      if (!isRecord(messageValue)) continue;
      const messages: Record<string, number> = {};
      for (const [messageId, at] of Object.entries(messageValue)) {
        if (typeof at === "number") messages[messageId] = at;
      }
      channels[channel] = pruneRecord(messages, MAX_HANDLED_PER_LANE);
    }
    handled[agentId] = channels;
  }
  return handled;
}

function parseLanes(raw: unknown): GatewayRuntimeState["lanes"] {
  if (!isRecord(raw)) return {};
  const lanes: GatewayRuntimeState["lanes"] = {};
  for (const [agentId, channelValue] of Object.entries(raw)) {
    if (!isRecord(channelValue)) continue;
    const channels: Record<string, GatewayLaneState> = {};
    for (const [channel, laneValue] of Object.entries(channelValue)) {
      const lane = parseLane(laneValue);
      if (lane && lane.agentId === agentId && lane.channel === channel) {
        channels[channel] = lane;
      }
    }
    lanes[agentId] = channels;
  }
  return lanes;
}

function parseLane(raw: unknown): GatewayLaneState | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.agentId !== "string" || typeof raw.channel !== "string") {
    return null;
  }
  return {
    agentId: raw.agentId,
    channel: raw.channel,
    queueDepth: typeof raw.queueDepth === "number" ? raw.queueDepth : 0,
    ...(parseCurrentTurn(raw.currentTurn)
      ? { currentTurn: parseCurrentTurn(raw.currentTurn)! }
      : {}),
    ...(parseLastOutcome(raw.lastOutcome)
      ? { lastOutcome: parseLastOutcome(raw.lastOutcome)! }
      : {}),
  };
}

function parseCurrentTurn(raw: unknown): GatewayLaneTurnState | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.messageId !== "string" || typeof raw.startedAt !== "number") {
    return null;
  }
  return {
    messageId: raw.messageId,
    startedAt: raw.startedAt,
  };
}

function parseLastOutcome(raw: unknown): GatewayLaneOutcomeState | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.messageId !== "string" || typeof raw.at !== "number") {
    return null;
  }
  if (
    raw.outcome !== "completed" &&
    raw.outcome !== "errored" &&
    raw.outcome !== "aborted"
  ) {
    return null;
  }
  return {
    messageId: raw.messageId,
    outcome: raw.outcome,
    at: raw.at,
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
  };
}

function parseLoopGuards(raw: unknown): GatewayLoopGuardTrip[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value): GatewayLoopGuardTrip[] => {
    if (!isRecord(value)) return [];
    if (
      typeof value.agentId !== "string" ||
      typeof value.channel !== "string" ||
      typeof value.messageId !== "string" ||
      typeof value.reason !== "string" ||
      typeof value.at !== "number"
    ) {
      return [];
    }
    if (EXPECTED_NON_REPORTABLE_GUARD_REASONS.has(value.reason)) return [];
    return [{
      agentId: value.agentId,
      channel: value.channel,
      messageId: value.messageId,
      reason: value.reason,
      at: value.at,
    }];
  }).slice(-MAX_LOOP_GUARD_TRIPS);
}

function pruneRecord(
  values: Record<string, number>,
  maxEntries: number,
): Record<string, number> {
  const entries = Object.entries(values);
  if (entries.length <= maxEntries) return values;
  return Object.fromEntries(
    entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxEntries),
  );
}
