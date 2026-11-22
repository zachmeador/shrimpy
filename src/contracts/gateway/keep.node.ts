import type { Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { describePlace, keepLink } from "../../lib/link/index.ts";
import type { DialPlace } from "../../lib/link/node.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { sayHello, UnprovenGatewayError } from "./dial.node.ts";
import { HelloRefusedError, UnknownAnswerError, type Welcome, type Who } from "./hello.ts";
import type { Principal, Revocation } from "./principals.ts";

export interface KeepLinkedOptions {
  /**
   * The host to keep linked: a program's, at its own address (`chat()` or
   * `agent({ id })`), or a client's, which serves nothing. A function returns
   * the host once the gateway's welcome has said who the program is, so an
   * agent's host can be addressed by its member ID.
   */
  readonly host:
    | Host<Principal, Revocation>
    | ((welcome: Welcome) => Promise<Host<Principal, Revocation>> | Host<Principal, Revocation>);
  /** The gateway's own socket, or its entry, with the fingerprint of its key. A function is asked afresh for each hello. */
  readonly place: DialPlace | (() => DialPlace);
  /** Who the host says it is, asked afresh for each hello: a program, or a client with its token or none. */
  who(): Exclude<Who, { kind: "join" }>;
  /** Abort to stop: the link is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  /** Told each time the gateway lets the host in, with what settles once that link has closed. */
  onWelcome?(answer: Welcome, closed: Promise<void>): void;
  /** Told why a hello failed: a `HelloRefusedError` when the gateway turned it away, an `UnknownAnswerError` when its answer can't be read, an `UnprovenGatewayError` when the entry didn't prove it is yours, and what dialing threw when the gateway couldn't be reached. */
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
      const place = typeof options.place === "function" ? options.place() : options.place;
      const { welcome, linked } = await sayHello(place, options.who(), { signal });
      let host: Host<Principal, Revocation>;
      try {
        host = typeof options.host === "function" ? await options.host(welcome) : options.host;
      } catch (error) {
        linked.drop();
        throw error;
      }
      if (signal.aborted) {
        linked.drop();
        throw signal.reason;
      }
      host.connect(linked.link, { principal: { kind: "gateway" } }, BACKGROUND_CONTEXT);
      options.onWelcome?.(welcome, linked.closed);
      return linked;
    },
    ...(options.onError === undefined ? {} : { onError: options.onError }),
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
  });
}

/** What a program says of its link to the gateway in words of its own. */
export interface LinkWords {
  /** Why the gateway turned the program's hello away, from the gateway's words. */
  refused(error: HelloRefusedError): string;
  /**
   * What follows "Can't reach the gateway at …": what the program does
   * meanwhile. A program without it says nothing of a gateway it can't reach,
   * or of one that is back.
   */
  meanwhile?: string;
}

/** Where a program stands with the gateway, as `keepLinked` tells it. */
export interface LinkReport {
  /** The gateway let the program in. */
  welcomed(): void;
  /** A hello failed, as `keepLinked`'s `onError` is told. */
  failed(error: unknown): void;
}

/**
 * Tell where a program stands with the gateway at `place`, one line at a time
 * to `tell`: that it can't reach the gateway, once however long that lasts, and
 * that it is back, once; and a hello turned away, an answer that can't be read
 * or an entry that didn't prove it is yours, each once until it changes or the
 * gateway lets the program in. An entry that didn't prove itself is out of
 * reach too, so the program says when it is back.
 */
export function reportLinking(
  place: DialPlace | (() => DialPlace),
  words: LinkWords,
  tell: (line: string) => void,
): LinkReport {
  const where = (): string => describePlace(typeof place === "function" ? place() : place);
  let away = false;
  let reported: string | undefined;
  const once = (line: string): void => {
    if (line === reported) return;
    reported = line;
    tell(line);
  };
  return {
    welcomed() {
      reported = undefined;
      if (away && words.meanwhile !== undefined) tell(`The gateway at ${where()} is back.`);
      away = false;
    },
    failed(error) {
      if (error instanceof HelloRefusedError) return once(words.refused(error));
      if (error instanceof UnknownAnswerError) return once(error.message);
      if (error instanceof UnprovenGatewayError) {
        away = true;
        return once(error.message);
      }
      if (away || words.meanwhile === undefined) return;
      away = true;
      tell(`Can't reach the gateway at ${where()}. ${words.meanwhile}`);
    },
  };
}
