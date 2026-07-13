import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isRecord } from "../util/record.js";
import type { SessionDescriptor } from "./spec.js";
import type { SessionKey } from "./identity.js";
import { formatSessionId } from "./identity.js";

export type SessionOwnerKind = "foreground" | "gateway" | "maintenance";

export interface SessionOwner {
  token: string;
  pid: number;
  kind: SessionOwnerKind;
  sessionId: string;
  agentId: string;
  channel?: string;
  acquiredAt: string;
}

export interface SessionLease {
  owner: SessionOwner;
  release(): void;
}

export function acquireSessionLease(input: {
  workspace: string;
  descriptor: SessionDescriptor;
  kind?: SessionOwnerKind;
}): SessionLease | undefined {
  if (input.descriptor.storage.kind !== "durable") return undefined;
  const key = input.descriptor.key;
  const channel = input.descriptor.delivery.kind === "channel"
    ? input.descriptor.delivery.channel
    : undefined;
  return acquireLease({
    workspace: input.workspace,
    key,
    owner: {
      token: randomUUID(),
      pid: process.pid,
      kind: input.kind ?? (channel ? "gateway" : "foreground"),
      sessionId: formatSessionId(key),
      agentId: key.agentId,
      channel,
      acquiredAt: new Date().toISOString(),
    },
  });
}

export function acquireMaintenanceLease(input: {
  workspace: string;
  key: SessionKey;
}): SessionLease {
  return acquireLease({
    workspace: input.workspace,
    key: input.key,
    owner: {
      token: randomUUID(),
      pid: process.pid,
      kind: "maintenance",
      sessionId: formatSessionId(input.key),
      agentId: input.key.agentId,
      acquiredAt: new Date().toISOString(),
    },
  });
}

export function readSessionOwner(
  workspace: string,
  key: SessionKey,
): SessionOwner | undefined {
  const path = sessionOwnerPath(workspace, key);
  if (!existsSync(path)) return undefined;
  const owner = parseSessionOwner(path);
  if (owner && processIsAlive(owner.pid)) return owner;
  try {
    unlinkSync(path);
  } catch {
    // A concurrent owner may already have replaced or removed a stale lease.
  }
  return undefined;
}

function acquireLease(input: {
  workspace: string;
  key: SessionKey;
  owner: SessionOwner;
}): SessionLease {
  const path = sessionOwnerPath(input.workspace, input.key);
  mkdirSync(join(input.workspace, "runtime", "sessions"), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, "wx", 0o600);
      try {
        writeFileSync(fd, `${JSON.stringify(input.owner, null, 2)}\n`, "utf8");
      } finally {
        closeSync(fd);
      }
      return {
        owner: input.owner,
        release: () => releaseLease(path, input.owner.token),
      };
    } catch (err) {
      const code = isRecord(err) && typeof err.code === "string" ? err.code : undefined;
      if (code !== "EEXIST") throw err;
      const existing = parseSessionOwner(path);
      if (existing && processIsAlive(existing.pid)) {
        throw new Error(
          `session ${input.owner.sessionId} is owned by ${existing.kind} process ${existing.pid}`,
        );
      }
      try {
        unlinkSync(path);
      } catch {
        // Retry once; a concurrent owner either won or removed the stale file.
      }
    }
  }

  throw new Error(`could not acquire session ${input.owner.sessionId}`);
}

function releaseLease(path: string, token: string): void {
  const owner = parseSessionOwner(path);
  if (!owner || owner.token !== token) return;
  try {
    unlinkSync(path);
  } catch {
    // Disposal must remain best effort.
  }
}

function sessionOwnerPath(workspace: string, key: SessionKey): string {
  const identity = `${key.agentId}\0${key.namespace}\0${key.name}\0${key.profileId}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  return join(workspace, "runtime", "sessions", `${digest}.json`);
}

function parseSessionOwner(path: string): SessionOwner | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(value)) return undefined;
    if (
      typeof value.token !== "string" ||
      typeof value.pid !== "number" ||
      (value.kind !== "foreground" && value.kind !== "gateway" && value.kind !== "maintenance") ||
      typeof value.sessionId !== "string" ||
      typeof value.agentId !== "string" ||
      typeof value.acquiredAt !== "string" ||
      (value.channel !== undefined && typeof value.channel !== "string")
    ) {
      return undefined;
    }
    return value as unknown as SessionOwner;
  } catch {
    return undefined;
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = isRecord(err) && typeof err.code === "string" ? err.code : undefined;
    return code === "EPERM";
  }
}
