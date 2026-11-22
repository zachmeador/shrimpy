import { formatAddress, type Linked } from "../../lib/link/index.ts";
import { dial, type Dialed, type DialPlace, OtherKeyError } from "../../lib/link/node.ts";
import type { Reason } from "./answers.ts";
import { type Hello, hello, readAnswer, unreadableAnswer, type Welcome, type Who } from "./hello.ts";

/** The other end turned the hello away: the gateway, or an agent on its home's socket, which takes the same hello. Its message is their words. */
export class HelloRefusedError extends Error {
  readonly reason: Reason | null;

  constructor(words: string, reason: Reason | null) {
    super(words);
    this.name = "HelloRefusedError";
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

/** The welcome, and the link that follows it. */
export interface Welcomed {
  readonly welcome: Welcome;
  readonly linked: Linked;
}

export interface SayHelloOptions {
  /** Abort to give up while the connection opens or the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Who answers, as the words name it when its answer can't be read: "The gateway" unless given. */
  readonly answering?: string;
}

/**
 * Say the hello at `place` as `who`, and read the answer: every link to the
 * gateway, on its own socket or at its entry, or to an agent on its home's
 * socket, and every join, starts here. At the entry the hello goes only to the
 * key whose fingerprint the place has: a key with another is an
 * `UnprovenGatewayError`, and nothing is sent. A hello the other end turns
 * away is a `HelloRefusedError`, and an answer this code can't read is an
 * `UnknownAnswerError`; either way the link is dropped. What dialing throws, as
 * it does when nothing listens there, is passed on as it is.
 */
export async function sayHello(place: DialPlace, who: Who, options: SayHelloOptions = {}): Promise<Welcomed> {
  const { answer: raw, linked } = await dialProven(place, hello(who), options.signal);
  const answer = readAnswer(raw);
  if (answer?.kind === "welcome") return { welcome: answer, linked };
  linked.drop();
  if (answer === undefined) throw new UnknownAnswerError(unreadableAnswer(raw, options.answering));
  throw new HelloRefusedError(answer.words, answer.reason);
}

/** Send `said` to the gateway at `place`: on its own socket as it is, and at its entry only once its key proves it. */
async function dialProven(place: DialPlace, said: Hello, signal: AbortSignal | undefined): Promise<Dialed> {
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
