import { createHost, type Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Principal, Revocation } from "../../../contracts/gateway/index.ts";
import { HelloRefusedError, keepLinked, UnprovenGatewayError } from "../../../contracts/gateway/node.ts";
import { asError } from "../../../lib/errors/index.ts";
import { type DialPlace, nobodyThere } from "../../../lib/link/node.ts";
import { createListeners } from "../../../lib/listeners/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import { CONNECTING, type LinkStatus, UP, type Why } from "./status.ts";

export interface GatewayLinkOptions {
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: DialPlace;
  /** A device's token, or null to be you on the gateway's own socket. */
  readonly token: string | null;
  /** The pauses between attempts to link. Tests shorten them. */
  readonly backoff?: Backoff;
}

/** The console's link to the gateway, kept across losses, through which it holds every object it shows. */
export interface GatewayLink {
  /** The console's host, which serves nothing and holds what it is given. What it holds is held again on each new link. */
  readonly host: Host<Principal, Revocation>;
  status(): LinkStatus;
  /** The Shrimpy version the gateway runs, as it last said. */
  version(): string | undefined;
  /** Tell `listener` each time either of these changes. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /** Stop linking, drop the link and close the host. */
  close(): Promise<void>;
}

/**
 * Keep the console linked to the gateway at `place`, with one host throughout,
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
  let version: string | undefined;

  const set = (next: LinkStatus): void => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    changes.notify(undefined);
  };
  const why = (error: unknown): Why => {
    if (error instanceof HelloRefusedError) return { kind: "refused", words: error.message };
    if (error instanceof UnprovenGatewayError) return { kind: "unproven", words: error.message };
    if ("path" in options.place && nobodyThere(error)) return { kind: "not-running" };
    return { kind: "unreachable", message: asError(error).message };
  };

  const linking = keepLinked({
    host,
    place: options.place,
    who: () => ({ kind: "client", token: options.token }),
    signal: stopping.signal,
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    onWelcome(answer, closed) {
      version = answer.shrimpy;
      set(UP);
      void closed.then(() => {
        if (!stopping.signal.aborted) set({ state: "down", why: { kind: "lost" } });
      });
    },
    onError(error) {
      // A link that tries again keeps saying it was lost, rather than that it cannot be reached yet.
      if (status.state === "down" && status.why.kind === "lost" && why(error).kind === "unreachable") return;
      set({ state: "down", why: why(error) });
    },
  });

  return {
    host,
    status: () => status,
    version: () => version,
    onChange: (listener) => changes.add(() => listener()),
    async close() {
      stopping.abort();
      changes.clear();
      await linking;
      await host.close(context);
    },
  };
}
