import type { Registration } from "./services.ts";

/** Names the gateway's Unix socket in the runtime directory. A machine has one gateway. */
export const GATEWAY_SOCKET_NAME = "gateway";

/**
 * The gateway's server ID, the same on every machine. A client has to find the
 * gateway before it can learn about anything else, so the ID is fixed instead
 * of being read from somewhere.
 */
export const GATEWAY_SERVER_ID = "40b634f0-e9e9-4ca6-8995-d72da1bdae1d";

// Written as a record so the compiler flags a kind added to `Registration` but not here.
const KINDS = { agent: true, chat: true } satisfies Record<Registration["kind"], true>;

export function isProgramKind(value: unknown): value is Registration["kind"] {
  return typeof value === "string" && Object.hasOwn(KINDS, value);
}

/** A byte pipe a browser can open: to the gateway itself, or to a registered program. */
export type WebTarget = "gateway" | Pick<Registration, "kind" | "name">;

/** The path of the WebSocket that pipes to `target` on the gateway's browser entry. */
export function webSocketPath(target: WebTarget): string {
  if (target === "gateway") return "/ws/gateway";
  return `/ws/${target.kind}/${encodeURIComponent(target.name)}`;
}

/** The target a WebSocket path names, or undefined when it names nothing the gateway serves. */
export function parseWebSocketPath(path: string): WebTarget | undefined {
  const [leading, root, ...rest] = path.split("/");
  if (leading !== "" || root !== "ws") return undefined;
  if (rest.length === 1 && rest[0] === "gateway") return "gateway";
  const [kind, encodedName] = rest;
  if (rest.length !== 2 || !isProgramKind(kind) || encodedName === undefined) return undefined;
  const name = decode(encodedName);
  return name === undefined || name === "" ? undefined : { kind, name };
}

function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
