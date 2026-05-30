import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";

interface IdentityLink {
  userId: string;
  actorId: string;
  displayName?: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
}

interface IdentityData {
  version: 1;
  owner?: string;
  links: Record<string, IdentityLink>;
}

export interface ResolvedHumanIdentity {
  userId: string;
  actorId: string;
  displayName?: string;
}

function linkKey(transport: string, transportUserId: string): string {
  return `${transport}:${transportUserId}`;
}

function defaultData(): IdentityData {
  return { version: 1, links: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseData(raw: unknown): IdentityData {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.links)) {
    return { version: 1, links: {} };
  }

  return {
    version: 1,
    owner: typeof raw.owner === "string" ? raw.owner : undefined,
    links: raw.links as Record<string, IdentityLink>,
  };
}

function loadData(path: string): IdentityData {
  return readJsonFile(path, defaultData, parseData);
}

function saveData(path: string, data: IdentityData): void {
  writeJsonFileAtomic(path, data);
}

export class IdentityStore {
  constructor(private readonly path: string) {}

  getOwnerIdentity(): ResolvedHumanIdentity | undefined {
    const data = loadData(this.path);
    if (!data.owner) return undefined;
    const link = Object.values(data.links).find((entry) => entry.userId === data.owner);
    if (!link) return undefined;
    return {
      userId: link.userId,
      actorId: link.actorId,
      displayName: link.displayName,
    };
  }

  setOwner(userId: string): void {
    const data = loadData(this.path);
    data.owner = userId;
    saveData(this.path, data);
  }

  listLinks(): Array<{ key: string; link: IdentityLink }> {
    const data = loadData(this.path);
    return Object.entries(data.links).map(([key, link]) => ({ key, link }));
  }

  getOwner(): string | undefined {
    return loadData(this.path).owner;
  }

  resolveHuman(input: {
    transport: string;
    transportUserId: string;
    userId?: string;
    actorId?: string;
    displayName?: string;
  }): ResolvedHumanIdentity {
    const key = linkKey(input.transport, input.transportUserId);
    const now = Date.now();
    const data = loadData(this.path);

    const existing = data.links[key];
    if (existing) {
      const updated: IdentityLink = {
        ...existing,
        userId: input.userId ?? existing.userId,
        actorId: input.actorId ?? existing.actorId,
        displayName: input.displayName ?? existing.displayName,
        lastSeenAtMs: now,
      };
      data.links[key] = updated;
      saveData(this.path, data);
      return {
        userId: updated.userId,
        actorId: updated.actorId,
        displayName: updated.displayName,
      };
    }

    const userId = input.userId ?? `user:${crypto.randomUUID()}`;
    const created: IdentityLink = {
      userId,
      actorId: input.actorId ?? `human:${userId}`,
      displayName: input.displayName,
      firstSeenAtMs: now,
      lastSeenAtMs: now,
    };
    data.links[key] = created;
    saveData(this.path, data);

    return {
      userId: created.userId,
      actorId: created.actorId,
      displayName: created.displayName,
    };
  }
}
