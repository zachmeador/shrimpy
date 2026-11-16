import { createHost, type Host, type HostError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { dialGateway, type GatewayPlace } from "./dial.node.ts";
import type { Principal, Revocation } from "./principals.ts";
import type { Member } from "./roster.ts";

/**
 * A client's link, once, to the gateway, through which it holds the gateway's,
 * the chat server's and the agents' objects, or to an agent on its home's
 * socket, through which it holds that agent's.
 */
export interface Client {
  /** The client's host, which serves nothing and holds what it is given. */
  readonly host: Host<Principal, Revocation>;
  /** Who the gateway takes the client for. Nobody, on an agent's home socket. */
  readonly you: Member | null;
  /** The Shrimpy version the other end runs. */
  readonly version: string;
  /** Settles once the link has closed, whoever closed it. Nothing links again by itself. */
  readonly closed: Promise<void>;
  /** Close the host and drop the link at once. Closing twice closes once. */
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** The gateway's own socket, or its entry with the fingerprint of its key, or an agent's home socket. */
  readonly place: GatewayPlace;
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
 * parent, the one dial of every client. A hello turned away is a
 * `GatewayRefusedError`, an answer this code can't read an
 * `UnknownAnswerError`, and an entry that doesn't prove it is yours an
 * `UnprovenGatewayError`.
 */
export async function connectClient(options: ConnectOptions): Promise<Client> {
  const { welcome, linked } = await dialGateway(options.place, { kind: "client", token: options.token }, {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.home === undefined ? {} : { answering: `The agent at ${options.home}` }),
  });
  const host = createHost<Principal, Revocation>({ onError: options.onError ?? (() => undefined) });
  await host.load([], BACKGROUND_CONTEXT);
  host.connect(linked.link, { principal: { kind: options.home === undefined ? "gateway" : "home" } }, BACKGROUND_CONTEXT);
  let closing: Promise<void> | undefined;
  return {
    host,
    you: welcome.you,
    version: welcome.shrimpy,
    closed: linked.closed,
    close() {
      closing ??= (async () => {
        linked.drop();
        await host.close(BACKGROUND_CONTEXT);
      })();
      return closing;
    },
  };
}
