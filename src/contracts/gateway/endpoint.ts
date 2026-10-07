import { decodeUri } from "../../lib/uri/index.ts";
import type { ProgramName, Registration } from "./services.ts";

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

/** A byte pipe that can be opened over WebSocket: to the gateway itself, or to a registered program. */
export type WebTarget = "gateway" | ProgramName;

/**
 * The path of the WebSocket that pipes to `target` on one of the gateway's
 * entries. On the gateway's network entry a way through to a program opens
 * only with a ticket that is good for that program, which the path carries.
 */
export function webSocketPath(target: WebTarget, ticket?: string): string {
  if (target === "gateway") return "/ws/gateway";
  const path = `/ws/${target.kind}/${encodeURIComponent(target.name)}`;
  return ticket === undefined ? path : `${path}?ticket=${encodeURIComponent(ticket)}`;
}

/** The target a WebSocket path names, or undefined when it names nothing the gateway serves. */
export function parseWebSocketPath(path: string): WebTarget | undefined {
  const [leading, root, ...rest] = path.split("/");
  if (leading !== "" || root !== "ws") return undefined;
  if (rest.length === 1 && rest[0] === "gateway") return "gateway";
  const [kind, encodedName] = rest;
  if (rest.length !== 2 || !isProgramKind(kind) || encodedName === undefined) return undefined;
  const name = decodeUri(encodedName);
  return name === undefined || name === "" ? undefined : { kind, name };
}

/**
 * What a request to the gateway's network entry asks for: the target its path
 * names, and the ticket it carries, if it carries one. Undefined when the path
 * names nothing the gateway serves.
 */
export function parseWebSocketRequest(url: string): { target: WebTarget; ticket: string | undefined } | undefined {
  const at = url.indexOf("?");
  const target = parseWebSocketPath(at === -1 ? url : url.slice(0, at));
  if (target === undefined) return undefined;
  const ticket = at === -1 ? null : new URLSearchParams(url.slice(at + 1)).get("ticket");
  return { target, ticket: ticket ?? undefined };
}
