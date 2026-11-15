import type { Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { keepLink } from "../../lib/link/node.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { dialGateway, type GatewayPlace } from "./dial.node.ts";
import type { Welcome, Who } from "./hello.ts";
import type { Principal, Revocation } from "./principals.ts";

interface KeepLinkedOptions {
  readonly host: Host<Principal, Revocation>;
  readonly place: GatewayPlace;
  who(): Who;
  readonly signal: AbortSignal;
  onWelcome?(answer: Welcome, closed: Promise<void>): void;
  readonly onError?: (error: unknown) => void;
  readonly backoff?: Backoff;
}

/**
 * Keep `host` linked to the gateway, with the gateway as its parent: the hello,
 * then Chord, and the same again after a pause that grows while hellos fail,
 * whenever the link drops. Resolves once `signal` aborts and the link is gone.
 */
function keepLinked(options: KeepLinkedOptions): Promise<void> {
  return keepLink({
    signal: options.signal,
    async link(signal) {
      const { welcome, linked } = await dialGateway(options.place, options.who(), { signal });
      options.host.connect(linked.link, { principal: { kind: "gateway" } }, BACKGROUND_CONTEXT);
      options.onWelcome?.(welcome, linked.closed);
      return linked;
    },
    ...(options.onError === undefined ? {} : { onError: options.onError }),
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
  });
}

export interface KeepProgramLinkedOptions {
  /** The program's host, at its own address: `chat()`, or `agent({ name })`. */
  readonly host: Host<Principal, Revocation>;
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: GatewayPlace;
  /** Who the program says it is, asked afresh for each hello. */
  who(): Extract<Who, { kind: "agent" } | { kind: "chat" }>;
  /** Abort to stop: the link is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  /** Told each time the gateway lets the program in. */
  onWelcome?(answer: Welcome): void;
  /** Told why a hello failed: a `GatewayRefusedError` when the gateway turned it away, an `UnknownAnswerError` when its answer can't be read, an `UnprovenGatewayError` when the entry didn't prove it is yours, and what dialing threw when the gateway couldn't be reached. */
  readonly onError?: (error: unknown) => void;
  readonly backoff?: Backoff;
}

/**
 * Keep a program linked to the gateway, as every program is: its link is its
 * registration, requests for it arrive over it, and its own go up it. After a
 * drop or a refusal it says its hello again, after a pause that grows while
 * hellos fail. Resolves once `signal` aborts and the link is gone.
 */
export function keepProgramLinked(options: KeepProgramLinkedOptions): Promise<void> {
  return keepLinked(options);
}

export interface KeepClientLinkedOptions {
  /** The client's host, which serves nothing and holds what it is given. */
  readonly host: Host<Principal, Revocation>;
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: GatewayPlace;
  /** A device's or an agent's token, or null to be you on the gateway's own socket. */
  readonly token: string | null;
  /** Abort to stop: the link is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  /** Told each time the gateway lets the client in, with what settles once that link has closed. */
  onWelcome?(answer: Welcome, closed: Promise<void>): void;
  /** Told why a hello failed: a `GatewayRefusedError` when the gateway turned it away, an `UnknownAnswerError` when its answer can't be read, an `UnprovenGatewayError` when the entry didn't prove it is yours, and what dialing threw when the gateway couldn't be reached. */
  readonly onError?: (error: unknown) => void;
  readonly backoff?: Backoff;
}

/**
 * Keep a client linked to the gateway, as a client that stays open does: one
 * host throughout, so whatever it holds goes loading while the link is down
 * and comes back with it. After a drop or a refusal it says its hello again,
 * after a pause that grows while hellos fail. Resolves once `signal` aborts and
 * the link is gone.
 */
export function keepClientLinked(options: KeepClientLinkedOptions): Promise<void> {
  return keepLinked({ ...options, who: () => ({ kind: "client", token: options.token }) });
}
