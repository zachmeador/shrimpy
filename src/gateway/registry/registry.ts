import { isAbsolute } from "node:path";
import { type Announcement, isProgramKind, type Registration } from "../../contracts/gateway/index.ts";

/** A peer sent something that is not a registration. */
export class InvalidRegistrationError extends Error {
  constructor(reason: string) {
    super(`Invalid registration: ${reason}`);
    this.name = "InvalidRegistrationError";
  }
}

/** What one connection may register. */
export interface Registrant {
  /**
   * Register this connection's program, as the agent `memberId` or, for the
   * chat server, as nobody. Registering again replaces the earlier entry. Says
   * what was registered.
   */
  register(announcement: unknown, memberId: string | null): Registration;
  /** The connection is gone: drop its entry. */
  close(): void;
}

export interface Registry {
  /** Start tracking one connection. */
  connect(): Registrant;
  /** The live registrations, oldest first. */
  list(): Registration[];
  /** The newest live registration of a program. */
  find(kind: Registration["kind"], name: string): Registration | undefined;
}

export interface RegistryOptions {
  /** What the member `memberId` is called now, so a registration follows its member when it is renamed. */
  nameOf(memberId: string): string | undefined;
}

/** What the chat server is called in the registry: it is a program, not a member. */
const CHAT_NAME = "chat";

interface Entry {
  announcement: Announcement;
  memberId: string | null;
}

/**
 * The registrations that are live right now. A connection holds at most one,
 * and it is dropped when the connection closes, so nothing expires and
 * nothing needs cleaning up.
 */
export function createRegistry(options: RegistryOptions): Registry {
  // A replaced entry moves to the end, so the map's order is oldest first.
  const entries = new Map<Registrant, Entry>();
  const describe = ({ announcement, memberId }: Entry): Registration => ({
    ...announcement,
    name: memberId === null ? CHAT_NAME : (options.nameOf(memberId) ?? memberId),
    memberId,
  });
  const list = (): Registration[] => [...entries.values()].map(describe);
  return {
    connect() {
      let closed = false;
      const registrant: Registrant = {
        register(announcement, memberId) {
          if (closed) throw new Error("The connection is closed");
          const entry = { announcement: checkAnnouncement(announcement), memberId };
          entries.delete(registrant);
          entries.set(registrant, entry);
          return describe(entry);
        },
        close() {
          closed = true;
          entries.delete(registrant);
        },
      };
      return registrant;
    },
    list,
    find: (kind, name) => list().findLast((entry) => entry.kind === kind && entry.name === name),
  };
}

/** A peer sends JSON, so the contract's types hold only once this has checked it. */
export function checkAnnouncement(value: unknown): Announcement {
  if (typeof value !== "object" || value === null) throw new InvalidRegistrationError("expected an object");
  const { kind, serverId, socket, pid, version } = value as Record<string, unknown>;
  if (!isProgramKind(kind)) throw new InvalidRegistrationError('kind must be "agent" or "chat"');
  if (typeof serverId !== "string" || serverId === "") {
    throw new InvalidRegistrationError("serverId must be a non-empty string");
  }
  if (typeof socket !== "string" || !isAbsolute(socket)) {
    throw new InvalidRegistrationError("socket must be an absolute path");
  }
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    throw new InvalidRegistrationError("pid must be a positive integer");
  }
  // Only that there is one is checked: the gateway never refuses a program for which version it runs.
  if (typeof version !== "string" || version === "") {
    throw new InvalidRegistrationError("version must be a non-empty string");
  }
  return { kind, serverId, socket, pid, version };
}
