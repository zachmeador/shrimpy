import type { Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { keepLink } from "../../lib/link/node.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { dialGateway, type GatewayPlace } from "./dial.node.ts";
import type { Welcome, Who } from "./hello.ts";
import type { Principal, Revocation } from "./principals.ts";

export interface KeepLinkedOptions {
  /** The host to keep linked: a program's, at its own address, `chat()` or `agent({ name })`, or a client's, which serves nothing. */
  readonly host: Host<Principal, Revocation>;
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: GatewayPlace;
  /** Who the host says it is, asked afresh for each hello: a program, or a client with its token or none. */
  who(): Exclude<Who, { kind: "join" }>;
  /** Abort to stop: the link is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  /** Told each time the gateway lets the host in, with what settles once that link has closed. */
  onWelcome?(answer: Welcome, closed: Promise<void>): void;
  /** Told why a hello failed: a `GatewayRefusedError` when the gateway turned it away, an `UnknownAnswerError` when its answer can't be read, an `UnprovenGatewayError` when the entry didn't prove it is yours, and what dialing threw when the gateway couldn't be reached. */
  readonly onError?: (error: unknown) => void;
  readonly backoff?: Backoff;
}

/**
 * Keep `host` linked to the gateway, with the gateway as its parent: the hello,
 * then Chord, and the same again after a drop or a refusal, after a pause that
 * grows while hellos fail. A program's link is its registration: requests for
 * it arrive over it, and its own go up it. A client keeps one host throughout,
 * so whatever it holds goes loading while the link is down and comes back with
 * it. Resolves once `signal` aborts and the link is gone.
 */
export function keepLinked(options: KeepLinkedOptions): Promise<void> {
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
