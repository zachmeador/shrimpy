import { createHost, type Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Principal, Revocation, Versions, Welcome, Who } from "../../contracts/gateway/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { CONNECTING, type LinkStatus, UP, type Why } from "./status.ts";

/**
 * Keep a client's host linked to the gateway: dial and say the hello, connect
 * the host to each link the gateway lets in, and dial again after a drop or a
 * refusal, after a pause that grows while hellos fail. Resolves once `signal`
 * aborts and the link is gone. The client hands the link one: the terminal
 * hands it `dialAt`, from `node.ts`.
 */
export type Dial = (options: DialOptions) => Promise<void>;

export interface DialOptions {
  /** The client's host, which serves nothing and holds what it is given. */
  readonly host: Host<Principal, Revocation>;
  /** Who the client says it is, asked afresh for each hello. */
  who(): Extract<Who, { kind: "client" }>;
  /** Abort to stop: the link is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  readonly backoff?: Backoff;
  /** Told each time the gateway lets the client in, with what settles once that link has closed. */
  onWelcome(answer: Welcome, closed: Promise<void>): void;
  /** Told why a hello failed, or why the gateway couldn't be reached. */
  readonly onError: (why: Why) => void;
}

export interface GatewayLinkOptions {
  /** How to dial the gateway, which the client hands it. */
  readonly dial: Dial;
  /** A device's token, or null to be you on the gateway's own socket. */
  readonly token: string | null;
  /** The pauses between attempts to link. Tests shorten them. */
  readonly backoff?: Backoff;
}

/** A client's link to the gateway, kept across losses, through which it holds every object it shows. */
export interface GatewayLink {
  /** The client's host, which serves nothing and holds what it is given. What it holds is held again on each new link. */
  readonly host: Host<Principal, Revocation>;
  status(): LinkStatus;
  /** What the gateway runs, as it last said, whether it let the client in or turned it away. */
  versions(): Versions | undefined;
  /** Tell `listener` each time either of these changes. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /** Stop linking, drop the link and close the host. */
  close(): Promise<void>;
}

/**
 * Keep a client linked to the gateway with `dial`, with one host throughout,
 * so whatever it holds goes loading while the link is down and comes back with
 * it, and say where the link stands as it changes.
 */
export async function keepGateway(options: GatewayLinkOptions): Promise<GatewayLink> {
  const context = BACKGROUND_CONTEXT;
  const host = createHost<Principal, Revocation>({ onError: () => undefined });
  await host.load([], context);
  const changes = createListeners<undefined>(() => undefined);
  const stopping = new AbortController();
  let status: LinkStatus = CONNECTING;
  let versions: Versions | undefined;

  const set = (next: LinkStatus): void => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    changes.notify(undefined);
  };

  const linking = options.dial({
    host,
    who: () => ({ kind: "client", token: options.token }),
    signal: stopping.signal,
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    onWelcome(answer, closed) {
      versions = { shrimpy: answer.shrimpy, pi: answer.pi };
      set(UP);
      void closed.then(() => {
        if (!stopping.signal.aborted) set({ state: "down", why: { kind: "lost" } });
      });
    },
    onError(why) {
      if (why.kind === "refused") versions = why.versions;
      // A link that tries again keeps saying it was lost, rather than that it cannot be reached yet.
      if (status.state === "down" && status.why.kind === "lost" && why.kind === "unreachable") return;
      set({ state: "down", why });
    },
  });

  return {
    host,
    status: () => status,
    versions: () => versions,
    onChange: (listener) => changes.add(() => listener()),
    async close() {
      stopping.abort();
      changes.clear();
      await linking;
      await host.close(context);
    },
  };
}
