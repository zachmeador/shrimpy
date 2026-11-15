import { createHost, type Host, type HostError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { dialGateway, type GatewayPlace } from "./dial.node.ts";
import type { Principal, Revocation } from "./principals.ts";
import type { Member } from "./roster.ts";

/** A client's link to the gateway, through which it holds the gateway's, the chat server's and the agents' objects. */
export interface GatewayClient {
  /** The client's host, which serves nothing and holds what it is given. */
  readonly host: Host<Principal, Revocation>;
  /** Who the gateway takes the client for. */
  readonly you: Member | null;
  /** The Shrimpy version the gateway runs. */
  readonly gatewayVersion: string;
  /** Settles once the link has closed, whoever closed it. Nothing links again by itself. */
  readonly closed: Promise<void>;
  /** Close the host and drop the link at once. */
  close(): Promise<void>;
}

export interface ConnectGatewayOptions {
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: GatewayPlace;
  /** A device's or an agent's token, or null to be you on the gateway's own socket. */
  readonly token: string | null;
  /** Abort to give up while the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Told of what fails in the client's host in the background. */
  readonly onError?: (error: HostError) => void;
}

/**
 * Link a client to the gateway once: the hello, then Chord with the gateway as
 * the client's parent. A hello the gateway turns away is a
 * `GatewayRefusedError`, and an entry that doesn't prove it is yours an
 * `UnprovenGatewayError`.
 */
export async function connectGateway(options: ConnectGatewayOptions): Promise<GatewayClient> {
  const { welcome, linked } = await dialGateway(
    options.place,
    { kind: "client", token: options.token },
    options.signal === undefined ? {} : { signal: options.signal },
  );
  const host = createHost<Principal, Revocation>({ onError: options.onError ?? (() => undefined) });
  await host.load([], BACKGROUND_CONTEXT);
  host.connect(linked.link, { principal: { kind: "gateway" } }, BACKGROUND_CONTEXT);
  return {
    host,
    you: welcome.you,
    gatewayVersion: welcome.shrimpy,
    closed: linked.closed,
    async close() {
      linked.drop();
      await host.close(BACKGROUND_CONTEXT);
    },
  };
}
