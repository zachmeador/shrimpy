import { isAbsolute } from "node:path";
import { isProgramKind, type Registration } from "../../contracts/gateway/index.ts";

/** A peer sent something that is not a registration. */
export class InvalidRegistrationError extends Error {
  constructor(reason: string) {
    super(`Invalid registration: ${reason}`);
    this.name = "InvalidRegistrationError";
  }
}

/** What one connection may register. */
export interface Registrant {
  /** Register this connection's program. Registering again replaces the earlier entry. */
  register(registration: unknown): void;
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

/**
 * The registrations that are live right now. A connection holds at most one,
 * and it is dropped when the connection closes, so nothing expires and
 * nothing needs cleaning up.
 */
export function createRegistry(): Registry {
  // A replaced entry moves to the end, so the map's order is oldest first.
  const entries = new Map<Registrant, Registration>();
  return {
    connect() {
      let closed = false;
      const registrant: Registrant = {
        register(registration) {
          if (closed) throw new Error("The connection is closed");
          const checked = check(registration);
          entries.delete(registrant);
          entries.set(registrant, checked);
        },
        close() {
          closed = true;
          entries.delete(registrant);
        },
      };
      return registrant;
    },
    list: () => [...entries.values()].map((entry) => ({ ...entry })),
    find(kind, name) {
      const matches = [...entries.values()].filter((entry) => entry.kind === kind && entry.name === name);
      const newest = matches.at(-1);
      return newest && { ...newest };
    },
  };
}

/** A peer sends JSON, so the contract's types hold only once this has checked it. */
function check(value: unknown): Registration {
  if (typeof value !== "object" || value === null) throw new InvalidRegistrationError("expected an object");
  const { kind, name, serverId, socket, pid, version } = value as Record<string, unknown>;
  if (!isProgramKind(kind)) throw new InvalidRegistrationError('kind must be "agent" or "chat"');
  if (typeof name !== "string" || name === "") {
    throw new InvalidRegistrationError("name must be a non-empty string");
  }
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
  return { kind, name, serverId, socket, pid, version };
}
