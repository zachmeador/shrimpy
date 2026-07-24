import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import { type ChannelMessage, sessionResetMessageInput, sessionRestoreMessageInput, sessionSettingsMessageInput, sessionStopMessageInput } from "../channels/protocol.js";
import { type OperationStatusContentData, readOperationStatusContent } from "../channels/messages.js";
import type { ModelRef } from "../config/model.js";
import type { ThinkingLevel } from "../config/thinking.js";
import { formatSessionId, type SessionKey } from "./identity.js";
import {
  acquireMaintenanceLease,
  readSessionOwner,
  type SessionOwner,
} from "./ownership.js";
import { resolveSessionDescriptor } from "./inventory.js";
import {
  archiveActiveSession,
  findActiveSessionFile,
  resolveArchivedSessionFile,
  restoreArchivedSession,
} from "./transcript-store.js";

type LifecycleAction = "new" | "clear" | "restore";
type Operation = "reset" | "restore" | "set" | "stop";

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
  requestedModel?: ModelRef;
  effectiveModel?: ModelRef;
  modelPolicy?: string;
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
  hadActiveSession?: boolean;
  requestedLevel?: ThinkingLevel;
  requestedModel?: ModelRef;
  modelPolicy?: string;
}

const CONTROL_TIMEOUT_MS = 30_000;
const CONTROL_POLL_MS = 100;

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
    ? basename(resolveArchivedSessionFile(target.dir, input.archive) ?? "")
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
      hadActiveSession: Boolean(findActiveSessionFile(target.dir)),
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

export function executeSessionSettingsAction(
  runtime: AppRuntime,
  input: {
    sessionId: string;
    thinking?: ThinkingLevel;
    model?: ModelRef;
    modelPolicy?: string;
    agentId?: string;
    wait?: boolean;
  },
  deps: SessionControlDeps = {},
): Promise<SessionActionResult> {
  const target = resolveTarget(runtime, input.agentId, input.sessionId);
  if (input.model && input.modelPolicy) {
    return Promise.resolve(failure(target, "set", "model and model policy are mutually exclusive"));
  }
  if (!input.thinking && !input.model && !input.modelPolicy) {
    return Promise.resolve(failure(target, "set", "no session setting was provided"));
  }
  return sendRunningControl(runtime, target, {
    operation: "set",
    wait: input.wait !== false,
    requestedLevel: input.thinking,
    requestedModel: input.model,
    modelPolicy: input.modelPolicy,
    make: (bus, channel) => bus.publish(sessionSettingsMessageInput({
      channel,
      targetAgentId: target.key.agentId,
      thinking: input.thinking,
      model: input.model,
      modelPolicy: input.modelPolicy,
      sender: cliSender(),
      origin: cliOrigin(channel),
      command: "sessions set",
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
    ...(request.requestedModel ? { requestedModel: request.requestedModel } : {}),
    ...(request.modelPolicy ? { modelPolicy: request.modelPolicy } : {}),
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
      message: `Session ${request.operation} was not confirmed within ${waitDurationMs}ms. Check "shrimpy gateway status" and "shrimpy sessions list ${target.id} --agent ${target.key.agentId}".`,
    };
  }
  if (!status.ok) {
    return { outcome: "failed", ...base, waitDurationMs, message: status.text };
  }
  const verificationError = request.sessionDir
    ? verifyLifecycle(
      request.operation,
      request.sessionDir,
      status,
      request.hadActiveSession ?? false,
    )
    : undefined;
  return {
    outcome: verificationError ? "unconfirmed" : "applied",
    ...base,
    waitDurationMs,
    ...(status.archiveName ? { archiveName: status.archiveName } : {}),
    ...(status.thinking ? { effectiveLevel: status.thinking } : {}),
    ...(status.model ? { effectiveModel: status.model } : {}),
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
    const restored = restoreArchivedSession(target.dir, archiveName);
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
  const archived = archiveActiveSession(target.dir);
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
  const descriptor = resolveSessionDescriptor(runtime, agentId, sessionId);
  if (descriptor.storage.kind !== "durable") throw new Error(`session ${sessionId} is not durable`);
  return {
    key: descriptor.key,
    id: formatSessionId(descriptor.key),
    dir: descriptor.storage.dir,
  };
}

function verifyLifecycle(
  operation: Operation,
  sessionDir: string,
  status: OperationStatusContentData,
  hadActiveSession: boolean,
): string | undefined {
  if (operation === "reset") {
    if (hadActiveSession && !status.archiveName) {
      return "Gateway reported success, but did not identify the archived session.";
    }
    if (status.archiveName && !resolveArchivedSessionFile(sessionDir, status.archiveName)) {
      return `Gateway reported success, but archived session ${status.archiveName} was not found on disk.`;
    }
    if (findActiveSessionFile(sessionDir)) {
      return "Gateway reported success, but the previous session was still active on disk.";
    }
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
