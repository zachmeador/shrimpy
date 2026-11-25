import { formatAddress } from "../../lib/link/index.ts";
import { dial, type Dialed, type DialPlace, OtherKeyError } from "../../lib/link/node.ts";
import { type Hello, hello, type Welcomed, welcomeIn, type Who } from "./hello.ts";
import { thisMachine } from "./where.node.ts";

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

export interface SayHelloOptions {
  /** Abort to give up while the connection opens or the hello waits for its answer. */
  readonly signal?: AbortSignal;
  /** Who answers, as the words name it when its answer can't be read: "The gateway" unless given. */
  readonly answering?: string;
}

/**
 * Say the hello at `place` as `who`, from this machine, and read the answer:
 * every link to the gateway, on its own socket or at its entry, or to an agent
 * on its home's socket, and every join, starts here. At the entry the hello
 * goes only to the key whose fingerprint the place has: a key with another is
 * an `UnprovenGatewayError`, and nothing is sent. A hello the other end turns
 * away is a `HelloRefusedError`, and an answer this code can't read is an
 * `UnknownAnswerError`; either way the link is dropped. What dialing throws, as
 * it does when nothing listens there, is passed on as it is.
 */
export async function sayHello(place: DialPlace, who: Who, options: SayHelloOptions = {}): Promise<Welcomed> {
  const { answer, linked } = await dialProven(place, hello(who, thisMachine()), options.signal);
  return welcomeIn(answer, linked, options.answering);
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
