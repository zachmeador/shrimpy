import { createHost, type Host, type HostError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Linked } from "../../lib/link/index.ts";
import type { Welcome } from "./hello.ts";
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

export interface ClientOptions {
  /** Who the other end is: the gateway, or an agent on its home's socket. */
  readonly parent: "gateway" | "home";
  /** Told of what fails in the client's host in the background. */
  readonly onError?: (error: HostError) => void;
}

/** The client over `linked`, which the other end welcomed with `welcome`: a host with the other end as its parent. */
export async function clientOver(welcome: Welcome, linked: Linked, options: ClientOptions): Promise<Client> {
  const host = createHost<Principal, Revocation>({ onError: options.onError ?? (() => undefined) });
  await host.load([], BACKGROUND_CONTEXT);
  host.connect(linked.link, { principal: { kind: options.parent } }, BACKGROUND_CONTEXT);
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
