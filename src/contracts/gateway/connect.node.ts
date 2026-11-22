import type { HostError } from "@earendil-works/chord";
import type { DialPlace } from "../../lib/link/node.ts";
import { type Client, clientOver } from "./client.ts";
import { sayHello } from "./dial.node.ts";

export interface ConnectOptions {
  /** The gateway's own socket, or its entry with the fingerprint of its key, or an agent's home socket. */
  readonly place: DialPlace;
  /** A device's or an agent's token, or null to be you on the gateway's own socket, and `home` on an agent's. */
  readonly token: string | null;
  /** The home whose agent's own socket `place` is, when it is one. */
  readonly home?: string;
  /** Abort to give up while the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Told of what fails in the client's host in the background. */
  readonly onError?: (error: HostError) => void;
}

/**
 * Link a client once: the hello, then Chord with the other end as the client's
 * parent, the one dial of every client in Node. A hello turned away is a
 * `HelloRefusedError`, an answer this code can't read an
 * `UnknownAnswerError`, and an entry that doesn't prove it is yours an
 * `UnprovenGatewayError`.
 */
export async function connectClient(options: ConnectOptions): Promise<Client> {
  const { welcome, linked } = await sayHello(options.place, { kind: "client", token: options.token }, {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.home === undefined ? {} : { answering: `The agent at ${options.home}` }),
  });
  return clientOver(welcome, linked, {
    parent: options.home === undefined ? "gateway" : "home",
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
}
