import { type Dialed, dial, type Linked, OtherKeyError } from "../../lib/link/node.ts";
import { type Entry, formatAddress } from "./address.ts";
import type { Reason } from "./answers.ts";
import { type Hello, hello, readAnswer, unreadableAnswer, type Welcome, type Who } from "./hello.ts";

/**
 * Where the gateway is reached: its own socket on this machine, or its entry,
 * which proves itself with the key whose fingerprint the member kept.
 */
export type GatewayPlace = { readonly path: string } | Entry;

/** The gateway turned a hello away. Its message is the gateway's words. */
export class GatewayRefusedError extends Error {
  readonly reason: Reason | null;

  constructor(words: string, reason: Reason | null) {
    super(words);
    this.name = "GatewayRefusedError";
    this.reason = reason;
  }
}

/**
 * The other end answered the hello with something this code can't read, as one
 * of another release may. Its message says what each side runs, when it said.
 */
export class UnknownAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownAnswerError";
  }
}

/**
 * The gateway's entry did not prove it is yours: the key there has another
 * fingerprint than the one kept for it. Nothing was sent to it, and the message
 * says so in words for a person.
 */
export class UnprovenGatewayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnprovenGatewayError";
  }
}

/** The gateway's welcome, and the link that follows it. */
export interface GatewayDialed {
  readonly welcome: Welcome;
  readonly linked: Linked;
}

export interface DialGatewayOptions {
  /** Abort to give up while the connection opens or the hello waits for its answer. */
  readonly signal?: AbortSignal;
}

/**
 * Say the hello to the gateway at `place` as `who`, and read its answer: every
 * link to the gateway, and every join, starts here. At the entry the hello goes
 * only to the key whose fingerprint the place has: a key with another is an
 * `UnprovenGatewayError`, and nothing is sent. A hello the gateway turns away
 * is a `GatewayRefusedError`, and an answer this code can't read is an
 * `UnknownAnswerError`; either way the link is dropped. What dialing throws, as
 * it does when no gateway is there, is passed on as it is.
 */
export async function dialGateway(place: GatewayPlace, who: Who, options: DialGatewayOptions = {}): Promise<GatewayDialed> {
  const { answer: raw, linked } = await dialProven(place, hello(who), options.signal);
  const answer = readAnswer(raw);
  if (answer?.kind === "welcome") return { welcome: answer, linked };
  linked.drop();
  if (answer === undefined) throw new UnknownAnswerError(unreadableAnswer(raw));
  throw new GatewayRefusedError(answer.words, answer.reason);
}

/** Send `said` to the gateway at `place`: on its own socket as it is, and at its entry only once its key proves it. */
async function dialProven(place: GatewayPlace, said: Hello, signal: AbortSignal | undefined): Promise<Dialed> {
  const options = signal === undefined ? {} : { signal };
  if ("path" in place) return dial(place, said, options);
  try {
    return await dial(place, said, options);
  } catch (error) {
    if (!(error instanceof OtherKeyError)) throw error;
    const shown = error.shown === undefined ? "no key" : `a key whose fingerprint is ${error.shown}`;
    throw new UnprovenGatewayError(
      `The gateway at ${formatAddress(place)} may not be yours: it shows ${shown}, where the invitation had ${place.fingerprint}. Nothing was sent to it.`,
      { cause: error },
    );
  }
}
