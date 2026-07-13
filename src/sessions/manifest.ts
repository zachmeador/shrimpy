import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isRecord } from "../util/record.js";
import type { SessionKey } from "./identity.js";
import { sameSessionKey } from "./identity.js";
import {
  createSessionDescriptor,
  type SessionDelivery,
  type SessionDescriptor,
} from "./spec.js";

const FILE_NAME = "session.json";
const VERSION = 1;

export interface SessionManifest {
  version: typeof VERSION;
  key: SessionKey;
  purpose: string;
  delivery: SessionDelivery;
}

export function ensureSessionManifest(descriptor: SessionDescriptor): void {
  if (descriptor.storage.kind !== "durable") return;
  const path = join(descriptor.storage.dir, FILE_NAME);
  const expected = manifestFor(descriptor);
  const existing = readSessionManifest(path);
  if (existing) {
    if (!sameSessionKey(existing.key, expected.key)) {
      throw new Error(`session manifest identity mismatch: ${path}`);
    }
    if (existing.purpose !== expected.purpose ||
      JSON.stringify(existing.delivery) !== JSON.stringify(expected.delivery)) {
      throw new Error(`session manifest binding mismatch: ${path}`);
    }
    return;
  }
  mkdirSync(descriptor.storage.dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
}

export function readSessionManifest(path: string): SessionManifest | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return parseManifest(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

export function listSessionDescriptors(agentRoot: string): SessionDescriptor[] {
  const root = join(agentRoot, "sessions");
  if (!existsSync(root)) return [];
  const descriptors: SessionDescriptor[] = [];
  for (const namespace of directories(root)) {
    for (const name of directories(join(root, namespace))) {
      for (const profile of directories(join(root, namespace, name))) {
        const manifest = readSessionManifest(join(root, namespace, name, profile, FILE_NAME));
        if (!manifest) continue;
        descriptors.push(createSessionDescriptor({
          agentRoot,
          key: manifest.key,
          purpose: manifest.purpose,
          delivery: manifest.delivery,
        }));
      }
    }
  }
  return descriptors;
}

function directories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function manifestFor(descriptor: SessionDescriptor): SessionManifest {
  return {
    version: VERSION,
    key: descriptor.key,
    purpose: descriptor.purpose,
    delivery: descriptor.delivery,
  };
}

function parseManifest(value: unknown): SessionManifest | undefined {
  if (!isRecord(value) || value.version !== VERSION || !isRecord(value.key)) return undefined;
  const { agentId, namespace, name, profileId } = value.key;
  if (typeof agentId !== "string" ||
    (namespace !== "local" && namespace !== "channel" && namespace !== "worker") ||
    typeof name !== "string" ||
    typeof profileId !== "string" ||
    typeof value.purpose !== "string" ||
    !isDelivery(value.delivery)) return undefined;
  return {
    version: VERSION,
    key: { agentId, namespace, name, profileId },
    purpose: value.purpose,
    delivery: value.delivery,
  };
}

function isDelivery(value: unknown): value is SessionDelivery {
  return isRecord(value) && (value.kind === "transcript" ||
    (value.kind === "channel" && typeof value.channel === "string"));
}
