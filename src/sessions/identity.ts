import { Buffer } from "node:buffer";
import { join } from "node:path";

export const DEFAULT_SESSION_PROFILE_ID = "default";

export type SessionNamespace = "local" | "channel" | "worker";

export interface SessionKey {
  agentId: string;
  namespace: SessionNamespace;
  name: string;
  profileId: string;
}

export function createSessionKey(input: {
  agentId: string;
  namespace: SessionNamespace;
  name: string;
  profileId?: string;
}): SessionKey {
  const agentId = requireSessionKeyPart(input.agentId, "agent id");
  const name = requireSessionKeyPart(input.name, "session name");
  const profileId = requireSessionKeyPart(
    input.profileId ?? DEFAULT_SESSION_PROFILE_ID,
    "session profile id",
  );
  return {
    agentId,
    namespace: input.namespace,
    name,
    profileId,
  };
}

export function createLocalSessionKey(input: {
  agentId: string;
  name: string;
  profileId?: string;
}): SessionKey {
  return createSessionKey({ ...input, namespace: "local" });
}

export function createChannelSessionKey(input: {
  agentId: string;
  channel: string;
  profileId?: string;
}): SessionKey {
  return createSessionKey({
    agentId: input.agentId,
    namespace: "channel",
    name: input.channel,
    profileId: input.profileId,
  });
}

export function createWorkerSessionKey(input: {
  agentId: string;
  workerId: string;
  profileId?: string;
}): SessionKey {
  return createSessionKey({
    agentId: input.agentId,
    namespace: "worker",
    name: input.workerId,
    profileId: input.profileId,
  });
}

export function formatSessionId(key: SessionKey): string {
  const base = `${key.namespace}/${encodeURIComponent(key.name)}`;
  return key.profileId === DEFAULT_SESSION_PROFILE_ID
    ? base
    : `${base}@${encodeURIComponent(key.profileId)}`;
}

export function parseSessionId(agentId: string, value: string): SessionKey {
  const trimmed = value.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(
      `invalid session id ${JSON.stringify(value)}; expected local/<name>, channel/<name>, or worker/<name>`,
    );
  }

  const namespace = trimmed.slice(0, slash);
  if (!isSessionNamespace(namespace)) {
    throw new Error(`invalid session namespace: ${namespace}`);
  }

  const encodedIdentity = trimmed.slice(slash + 1);
  const profileSeparator = encodedIdentity.lastIndexOf("@");
  const encodedName = profileSeparator < 0
    ? encodedIdentity
    : encodedIdentity.slice(0, profileSeparator);
  const encodedProfile = profileSeparator < 0
    ? DEFAULT_SESSION_PROFILE_ID
    : encodedIdentity.slice(profileSeparator + 1);

  return createSessionKey({
    agentId,
    namespace,
    name: decodeSessionIdPart(encodedName, "session name"),
    profileId: decodeSessionIdPart(encodedProfile, "session profile id"),
  });
}

export function sessionRootPath(agentRoot: string, key: SessionKey): string {
  return join(
    agentRoot,
    "sessions",
    key.namespace,
    encodePathPart(key.name),
    encodePathPart(key.profileId),
  );
}

export function sameSessionKey(left: SessionKey, right: SessionKey): boolean {
  return left.agentId === right.agentId &&
    left.namespace === right.namespace &&
    left.name === right.name &&
    left.profileId === right.profileId;
}

function isSessionNamespace(value: string): value is SessionNamespace {
  return value === "local" || value === "channel" || value === "worker";
}

function requireSessionKeyPart(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function decodeSessionIdPart(value: string, label: string): string {
  try {
    return requireSessionKeyPart(decodeURIComponent(value), label);
  } catch (err) {
    if (err instanceof URIError) {
      throw new Error(`invalid encoded ${label}: ${value}`);
    }
    throw err;
  }
}

function encodePathPart(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
