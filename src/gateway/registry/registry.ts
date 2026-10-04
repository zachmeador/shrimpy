import { isAbsolute } from "node:path";
import { isServerId } from "@earendil-works/pi-protocol";
import { type Announcement, isProgramKind, type ProgramName, type Registration } from "../../contracts/gateway/index.ts";

/** A peer sent something that is not a registration. */
export class InvalidRegistrationError extends Error {
  constructor(reason: string) {
    super(`Invalid registration: ${reason}`);
    this.name = "InvalidRegistrationError";
  }
}

/**
 * A registered program with what only the gateway is told: the server ID it
 * answers as and the socket the gateway pipes connections to. The registry's
 * list never shows these.
 */
export interface Registered extends Registration {
  serverId: string;
  socket: string;
}

/** What one connection may register. */
export interface Registrant {
  /**
   * Register this connection's program, as the agent `memberId` or, for the
   * chat server, as nobody. Registering again replaces the earlier entry. Says
   * what was registered.
   */
  register(announcement: unknown, memberId: string | null): Registered;
  /** The connection is gone: drop its entry. */
  close(): void;
}

export interface Registry {
  /** Start tracking one connection. */
  connect(): Registrant;
  /** The live registrations, oldest first, as clients are told of them. */
  list(): Registration[];
  /** The name of each program that is registered, once. */
  names(): ProgramName[];
  /** The newest live registration of a program. */
  find(kind: Registration["kind"], name: string): Registered | undefined;
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
  const describe = ({ announcement, memberId }: Entry): Registered => ({
    kind: announcement.kind,
    name: memberId === null ? CHAT_NAME : (options.nameOf(memberId) ?? memberId),
    memberId,
    version: announcement.version,
    serverId: announcement.serverId,
    socket: announcement.socket,
  });
  const all = (): Registered[] => [...entries.values()].map(describe);
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
    list: () => all().map(({ kind, name, memberId, version }) => ({ kind, name, memberId, version })),
    names() {
      const seen = new Map<string, ProgramName>();
      for (const { kind, name } of all()) seen.set(`${kind}\0${name}`, { kind, name });
      return [...seen.values()];
    },
    find: (kind, name) => all().findLast((entry) => entry.kind === kind && entry.name === name),
  };
}

/** A peer sends JSON, so the contract's types hold only once this has checked it. */
export function checkAnnouncement(value: unknown): Announcement {
  if (typeof value !== "object" || value === null) throw new InvalidRegistrationError("expected an object");
  const { kind, serverId, socket, version } = value as Record<string, unknown>;
  if (!isProgramKind(kind)) throw new InvalidRegistrationError('kind must be "agent" or "chat"');
  if (!isServerId(serverId)) throw new InvalidRegistrationError("serverId must be a lowercase UUID, version 4");
  if (typeof socket !== "string" || !isAbsolute(socket)) {
    throw new InvalidRegistrationError("socket must be an absolute path");
  }
  // Only that there is one is checked: the gateway never refuses a program for which version it runs.
  if (typeof version !== "string" || version === "") {
    throw new InvalidRegistrationError("version must be a non-empty string");
  }
  return { kind, serverId, socket, version };
}
