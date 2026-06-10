import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import { isRecord } from "../../util/record.js";

export interface UserPresenceEntry {
  userId: string;
  channel: string;
  surface: string;
  transport: string;
  transportChatId: string;
  at: number;
}

interface UserPresenceFile {
  version: 1;
  users: Record<string, UserPresenceEntry>;
}

const USER_ALIAS_PREFIX = "user:";

function emptyPresence(): UserPresenceFile {
  return {
    version: 1,
    users: {},
  };
}

function parsePresence(raw: unknown): UserPresenceFile {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.users)) {
    return emptyPresence();
  }

  const users: Record<string, UserPresenceEntry> = {};
  for (const [userId, value] of Object.entries(raw.users)) {
    if (!isRecord(value)) continue;
    if (
      typeof value.userId !== "string" ||
      typeof value.channel !== "string" ||
      typeof value.surface !== "string" ||
      typeof value.transport !== "string" ||
      typeof value.transportChatId !== "string" ||
      typeof value.at !== "number"
    ) {
      continue;
    }
    users[userId] = {
      userId: value.userId,
      channel: value.channel,
      surface: value.surface,
      transport: value.transport,
      transportChatId: value.transportChatId,
      at: value.at,
    };
  }

  return {
    version: 1,
    users,
  };
}

function loadPresence(path: string): UserPresenceFile {
  return readJsonFile(path, emptyPresence, parsePresence);
}

function savePresence(path: string, data: UserPresenceFile): void {
  writeJsonFileAtomic(path, data);
}

export function isUserChannelAlias(channel: string): boolean {
  return channel.startsWith(USER_ALIAS_PREFIX) && channel.length > USER_ALIAS_PREFIX.length;
}

export function userIdFromChannelAlias(channel: string): string {
  return channel.slice(USER_ALIAS_PREFIX.length);
}

export class UserPresenceStore {
  constructor(private readonly path: string) {}

  record(input: Omit<UserPresenceEntry, "at"> & { at?: number }): UserPresenceEntry {
    const data = loadPresence(this.path);
    const entry = {
      ...input,
      at: input.at ?? Date.now(),
    };
    data.users[input.userId] = entry;
    savePresence(this.path, data);
    return entry;
  }

  get(userId: string): UserPresenceEntry | undefined {
    return loadPresence(this.path).users[userId];
  }

  list(): UserPresenceEntry[] {
    return Object.values(loadPresence(this.path).users)
      .sort((a, b) => b.at - a.at || a.userId.localeCompare(b.userId));
  }

  resolveChannel(channel: string): string {
    if (!isUserChannelAlias(channel)) return channel;

    const userId = userIdFromChannelAlias(channel);
    const entry = this.get(userId);
    if (!entry) {
      throw new Error(`no last-active surface channel recorded for ${channel}`);
    }
    return entry.channel;
  }
}

export function resolveUserChannelAlias(
  presencePath: string | undefined,
  channel: string,
): string {
  if (!isUserChannelAlias(channel)) return channel;
  if (!presencePath) {
    throw new Error(`cannot resolve ${channel}; no user presence store is configured`);
  }
  return new UserPresenceStore(presencePath).resolveChannel(channel);
}
