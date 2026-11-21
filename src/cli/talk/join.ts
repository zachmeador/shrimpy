import { type Entry, type Member, type Welcome, type Who } from "../../contracts/gateway/index.ts";
import { HelloRefusedError, sayHello, UnknownAnswerError, UnprovenGatewayError } from "../../contracts/gateway/node.ts";
import { asError } from "../../lib/errors/index.ts";
import { formatAddress } from "../../lib/link/index.ts";

/**
 * A join that was tried and failed: the gateway could not be reached, stopped
 * answering, showed another key or turned the join away. The token that was
 * shown is kept, so the same link can be used again while its code is good. A
 * link that does not fit is no such failure: nothing was tried.
 */
export class JoinFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JoinFailedError";
  }
}

/** What a join came to. */
export interface Joined {
  /** Who the gateway says the joiner is: the agent, or you for a machine of yours. */
  member: Member;
  /** The ID of the roster the joiner joined, or null if the gateway sent none. */
  rosterId: string | null;
  /** The version of Shrimpy the gateway runs. */
  gatewayVersion: string;
}

/** How a home or a machine that has joined already joins anew: delete `file`, which keeps the token that joined, and join again. */
export const joinedAlready = (file: string): string => `To join anew, delete ${file} and run this again.`;

/** That the gateway at `where` turned `who` away, with the gateway's words. */
export const notLetIn = (where: string, who: string, words: string): string => `The gateway at ${where} did not let ${who} in: ${words}`;

/**
 * Join the gateway at its entry as `who`, called `named` in what is said, and
 * hang up: the hello goes only to the key the entry names. Gives who the
 * gateway says the joiner is, and the version of Shrimpy it runs. A gateway
 * that can't be reached, that doesn't answer before `signal` aborts, that shows
 * another key, or that turns the join away or lets it in as nobody, is a
 * `JoinFailedError`.
 */
export async function joinGateway(
  entry: Entry,
  who: Extract<Who, { kind: "join" }>,
  named: string,
  signal: AbortSignal | undefined,
): Promise<Joined> {
  const where = formatAddress(entry);
  let answer: Welcome;
  try {
    const dialed = await sayHello(entry, who, signal === undefined ? {} : { signal });
    dialed.linked.drop();
    answer = dialed.welcome;
  } catch (error) {
    if (error instanceof HelloRefusedError) throw new JoinFailedError(notLetIn(where, named, error.message), { cause: error });
    if (error instanceof UnknownAnswerError || error instanceof UnprovenGatewayError) {
      throw new JoinFailedError(error.message, { cause: error });
    }
    throw new JoinFailedError(`Could not join the gateway at ${where}: ${asError(error).message}`, { cause: error });
  }
  if (answer.you === null) throw new JoinFailedError(`The gateway at ${where} let ${named} in as nobody.`);
  return { member: answer.you, rosterId: answer.roster, gatewayVersion: answer.shrimpy };
}
