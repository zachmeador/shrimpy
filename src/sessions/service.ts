import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  type ChannelMessage,
  type OperationStatusContentData,
  readOperationStatusContent,
  sessionResetMessageInput,
  sessionRestoreMessageInput,
  sessionStopMessageInput,
  sessionThinkingLevelMessageInput,
} from "../channels/index.js";
import {
  flattenGatewayLanes,
  gatewayRuntimeStatePath,
  loadGatewayRuntimeState,
  type GatewayLaneState,
} from "../gateway/runtime-state.js";
import type { ThinkingLevel } from "./thinking.js";
import {
  formatSessionId,
  parseSessionId,
  sameSessionKey,
  type SessionKey,
} from "./identity.js";
import {
  acquireMaintenanceLease,
  readSessionOwner,
  type SessionOwner,
} from "./ownership.js";
import { createSessionDescriptor, type SessionDescriptor } from "./spec.js";
import {
  archiveSessionDir,
  findActiveSessionFile,
  listArchivedSessionDirs,
  listSessionDescriptors,
  resolveArchivedSessionDir,
  restoreArchivedSessionDir,
} from "./storage.js";

type LifecycleAction = "new" | "clear" | "restore";
type Operation = "reset" | "restore" | "thinking" | "stop";

export interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
}

export interface SessionSummary {
  sessionId: string;
  purpose: string;
  delivery: SessionDescriptor["delivery"];
  active: SessionPathSummary;
  archives: SessionPathSummary[];
  owner?: SessionOwner;
  gatewayLanes: GatewayLaneState[];
}

export interface SessionListingSummary {
  agentId: string;
  sessionsRoot: string;
  sessions: SessionSummary[];
}

export type SessionActionOutcome =
  | "applied"
  | "applied_direct"
  | "failed"
  | "unconfirmed"
  | "queued";

export interface SessionActionResult {
  outcome: SessionActionOutcome;
  operation: Operation;
  sessionId: string;
  agentId: string;
  channel?: string;
  archiveName?: string;
  archivedPreviousName?: string;
  requestMessageId?: string;
  waitDurationMs: number;
  requestedLevel?: ThinkingLevel;
  effectiveLevel?: ThinkingLevel;
  message?: string;
}

export interface SessionControlDeps {
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface SessionTarget {
  key: SessionKey;
  id: string;
  dir: string;
}

interface ControlRequest {
  operation: Operation;
  wait: boolean;
  make(bus: ChannelBus, channel: string): ChannelMessage;
  sessionDir?: string;
  requestedLevel?: ThinkingLevel;
}

const CONTROL_TIMEOUT_MS = 30_000;
const CONTROL_POLL_MS = 100;

export function summarizeAgentSessions(
  runtime: AppRuntime,
  opts?: { agentId?: string; sessionId?: string },
): SessionListingSummary | SessionSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const descriptors = listSessionDescriptors(agentRoot);
  if (opts?.sessionId) {
    const key = parseSessionId(agent.id, opts.sessionId);
    return summarizeDescriptor(
      runtime,
      descriptors.find((item) => sameSessionKey(item.key, key)) ?? descriptorFor(agentRoot, key),
    );
  }
  return {
    agentId: agent.id,
    sessionsRoot: `${agentRoot}/sessions`,
    sessions: descriptors
      .map((descriptor) => summarizeDescriptor(runtime, descriptor))
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
  };
}

export async function executeSessionLifecycleAction(
  runtime: AppRuntime,
  input: {
    action: LifecycleAction;
    sessionId: string;
    agentId?: string;
    archive?: string;
    wait?: boolean;
  },
  deps: SessionControlDeps = {},
): Promise<SessionActionResult> {
  const target = resolveTarget(runtime, input.agentId, input.sessionId);
  const operation = input.action === "restore" ? "restore" : "reset";
  const archiveName = input.archive
    ? basename(resolveArchivedSessionDir(target.dir, input.archive) ?? "")
    : undefined;
  if (input.archive && !archiveName) {
    return failure(target, operation, `archive not found for ${target.id}: ${input.archive}`);
  }

  const owner = readSessionOwner(runtime.paths.workspace, target.key);
  if (owner) {
    if (owner.kind !== "gateway" || !owner.channel) return ownerFailure(target, operation, owner);
    return sendControl(runtime, target, owner.channel, {
      operation,
      wait: input.wait !== false,
      sessionDir: target.dir,
      make: (bus, channel) => input.action === "restore"
        ? bus.publish(sessionRestoreMessageInput({
          channel,
          targetAgentId: target.key.agentId,
          archiveName,
          sender: cliSender(),
          origin: cliOrigin(channel),
          command: "/restore",
        }))
        : bus.publish(sessionResetMessageInput({
          channel,
          targetAgentId: target.key.agentId,
          sender: cliSender(),
          origin: cliOrigin(channel),
          command: `/${input.action}`,
        })),
    }, deps);
  }

  try {
    const lease = acquireMaintenanceLease({ workspace: runtime.paths.workspace, key: target.key });
    try {
      return applyOffline(target, input.action, archiveName);
    } finally {
      lease.release();
    }
  } catch (err) {
    return failure(target, operation, errorMessage(err));
  }
}

export function executeSessionThinkingAction(
  runtime: AppRuntime,
  input: { sessionId: string; level: ThinkingLevel; agentId?: string; wait?: boolean },
  deps: SessionControlDeps = {},
): Promise<SessionActionResult> {
  const target = resolveTarget(runtime, input.agentId, input.sessionId);
  return sendRunningControl(runtime, target, {
    operation: "thinking",
    wait: input.wait !== false,
    requestedLevel: input.level,
    make: (bus, channel) => bus.publish(sessionThinkingLevelMessageInput({
      channel,
      targetAgentId: target.key.agentId,
      level: input.level,
      sender: cliSender(),
      origin: cliOrigin(channel),
      command: "/thinking",
    })),
  }, deps);
}

export function executeSessionStopAction(
  runtime: AppRuntime,
  input: { sessionId: string; agentId?: string; wait?: boolean },
  deps: SessionControlDeps = {},
): Promise<SessionActionResult> {
  const target = resolveTarget(runtime, input.agentId, input.sessionId);
  return sendRunningControl(runtime, target, {
    operation: "stop",
    wait: input.wait !== false,
    make: (bus, channel) => bus.publish(sessionStopMessageInput({
      channel,
      targetAgentId: target.key.agentId,
      sender: cliSender(),
      origin: cliOrigin(channel),
      command: "/stop",
    })),
  }, deps);
}

function sendRunningControl(
  runtime: AppRuntime,
  target: SessionTarget,
  request: ControlRequest,
  deps: SessionControlDeps,
): Promise<SessionActionResult> {
  const owner = readSessionOwner(runtime.paths.workspace, target.key);
  if (!owner) {
    return Promise.resolve(failure(target, request.operation, `Session ${target.id} is not running.`));
  }
  if (owner.kind !== "gateway" || !owner.channel) {
    return Promise.resolve(ownerFailure(target, request.operation, owner));
  }
  return sendControl(runtime, target, owner.channel, request, deps);
}

async function sendControl(
  runtime: AppRuntime,
  target: SessionTarget,
  channel: string,
  request: ControlRequest,
  deps: SessionControlDeps,
): Promise<SessionActionResult> {
  const bus = runtime.createChannelBus();
  const cursor = bus.read(channel).cursor;
  const message = request.make(bus, channel);
  const base = {
    operation: request.operation,
    sessionId: target.id,
    agentId: target.key.agentId,
    channel,
    requestMessageId: message.id,
    ...(request.requestedLevel ? { requestedLevel: request.requestedLevel } : {}),
  };
  if (!request.wait) return { outcome: "queued", ...base, waitDurationMs: 0 };

  const startedAt = Date.now();
  const status = await waitForStatus(bus, channel, message.id, cursor, deps);
  const waitDurationMs = Date.now() - startedAt;
  if (!status) {
    return {
      outcome: "unconfirmed",
      ...base,
      waitDurationMs,
      message: `Session ${request.operation} was not confirmed within ${waitDurationMs}ms.`,
    };
  }
  if (!status.ok) {
    return { outcome: "failed", ...base, waitDurationMs, message: status.text };
  }
  const verificationError = request.sessionDir
    ? verifyLifecycle(request.operation, request.sessionDir, status)
    : undefined;
  return {
    outcome: verificationError ? "unconfirmed" : "applied",
    ...base,
    waitDurationMs,
    ...(status.archiveName ? { archiveName: status.archiveName } : {}),
    message: verificationError ?? status.text,
  };
}

async function waitForStatus(
  bus: ChannelBus,
  channel: string,
  requestId: string,
  initialCursor: { byteOffset: number },
  deps: SessionControlDeps,
): Promise<OperationStatusContentData | undefined> {
  const deadline = Date.now() + (deps.timeoutMs ?? CONTROL_TIMEOUT_MS);
  const interval = deps.pollIntervalMs ?? CONTROL_POLL_MS;
  const pause = deps.sleep ?? sleep;
  let cursor = initialCursor;
  while (true) {
    const read = bus.read(channel, cursor);
    cursor = read.cursor;
    for (const message of read.messages) {
      const status = readOperationStatusContent(message.content);
      if (status?.requestMessageId === requestId) return status;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    await pause(Math.min(interval, remaining));
  }
}

function applyOffline(
  target: SessionTarget,
  action: LifecycleAction,
  archiveName?: string,
): SessionActionResult {
  if (action === "restore") {
    const restored = restoreArchivedSessionDir(target.dir, archiveName);
    if (!restored) {
      throw new Error(archiveName
        ? `archive not found for ${target.id}: ${archiveName}`
        : `no archived sessions for ${target.id}`);
    }
    return {
      ...resultBase(target, "restore"),
      outcome: "applied_direct",
      archiveName: basename(restored.restoredFrom),
      ...(restored.archivedPreviousTo
        ? { archivedPreviousName: basename(restored.archivedPreviousTo) }
        : {}),
    };
  }
  const archived = archiveSessionDir(target.dir);
  return {
    ...resultBase(target, "reset"),
    outcome: "applied_direct",
    ...(archived ? { archiveName: basename(archived) } : {}),
  };
}

function resolveTarget(
  runtime: AppRuntime,
  agentId: string | undefined,
  sessionId: string,
): SessionTarget {
  const agent = runtime.getAgent(agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const key = parseSessionId(agent.id, sessionId);
  const descriptor = listSessionDescriptors(agentRoot).find((item) =>
    sameSessionKey(item.key, key)
  ) ?? descriptorFor(agentRoot, key);
  if (descriptor.storage.kind !== "durable") throw new Error(`session ${sessionId} is not durable`);
  return { key, id: formatSessionId(key), dir: descriptor.storage.dir };
}

function descriptorFor(agentRoot: string, key: SessionKey): SessionDescriptor {
  const purpose = key.namespace === "channel"
    ? "channel"
    : key.namespace === "worker"
      ? "worker"
      : key.name === "setup" ? "setup" : "interactive";
  return createSessionDescriptor({
    agentRoot,
    key,
    purpose,
    delivery: key.namespace === "channel"
      ? { kind: "channel", channel: key.name }
      : { kind: "transcript" },
  });
}

function summarizeDescriptor(runtime: AppRuntime, descriptor: SessionDescriptor): SessionSummary {
  if (descriptor.storage.kind !== "durable") throw new Error("cannot summarize an in-memory session");
  const channel = descriptor.delivery.kind === "channel" ? descriptor.delivery.channel : undefined;
  return {
    sessionId: formatSessionId(descriptor.key),
    purpose: descriptor.purpose,
    delivery: descriptor.delivery,
    active: summarizeActivePath(descriptor.storage.dir),
    archives: listArchivedSessionDirs(descriptor.storage.dir).map(summarizePath),
    owner: readSessionOwner(runtime.paths.workspace, descriptor.key),
    gatewayLanes: channel ? gatewayLanesFor(runtime, descriptor.key.agentId, channel) : [],
  };
}

function verifyLifecycle(
  operation: Operation,
  sessionDir: string,
  status: OperationStatusContentData,
): string | undefined {
  if (operation === "reset" && status.archiveName &&
    !resolveArchivedSessionDir(sessionDir, status.archiveName)) {
    return `Gateway reported success, but archived session ${status.archiveName} was not found on disk.`;
  }
  if (operation === "restore") {
    const active = findActiveSessionFile(sessionDir);
    if (!status.archiveName || !active || basename(active) !== status.archiveName) {
      return "Gateway reported success, but the restored session was not active on disk.";
    }
  }
  return undefined;
}

function resultBase(target: SessionTarget, operation: Operation) {
  return {
    operation,
    sessionId: target.id,
    agentId: target.key.agentId,
    waitDurationMs: 0,
  };
}

function failure(target: SessionTarget, operation: Operation, message: string): SessionActionResult {
  return { ...resultBase(target, operation), outcome: "failed", message };
}

function ownerFailure(
  target: SessionTarget,
  operation: Operation,
  owner: SessionOwner,
): SessionActionResult {
  return failure(
    target,
    operation,
    `Session ${target.id} is owned by ${owner.kind} process ${owner.pid}; use that host's session controls.`,
  );
}

function summarizePath(path: string): SessionPathSummary {
  const exists = existsSync(path);
  return {
    name: basename(path),
    path,
    exists,
    updatedAt: exists ? new Date(statSync(path).mtimeMs).toISOString() : null,
  };
}

function summarizeActivePath(sessionDir: string): SessionPathSummary {
  const active = findActiveSessionFile(sessionDir);
  return active ? summarizePath(active) : {
    name: basename(sessionDir),
    path: sessionDir,
    exists: false,
    updatedAt: null,
  };
}

function gatewayLanesFor(runtime: AppRuntime, agentId: string, channel: string) {
  const state = loadGatewayRuntimeState(gatewayRuntimeStatePath(runtime.paths));
  return flattenGatewayLanes(state, { agentId, channel });
}

function cliSender() {
  return { kind: "system" as const, actorId: "system:cli", displayName: "shrimpy-cli" };
}

function cliOrigin(channel: string) {
  return { transport: "cli", sourceChannel: channel };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message.trim() ? err.message.trim() : String(err);
}
