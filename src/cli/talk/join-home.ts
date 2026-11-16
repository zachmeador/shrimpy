import { hostname } from "node:os";
import { loadHome, readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Entry, type Member, readLink, type Welcome } from "../../contracts/gateway/index.ts";
import {
  dialGateway,
  GatewayRefusedError,
  newToken,
  UnknownAnswerError,
  UnprovenGatewayError,
} from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";

/**
 * The gateway could not be reached, stopped answering, or turned the agent
 * away. The home keeps the agent's token, so the same link can be used again
 * while its code is good. A link that does not fit the home is no such failure:
 * nothing was tried.
 */
export class JoinFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JoinFailedError";
  }
}

export interface JoinHomeOptions {
  /** Abort to give up on a gateway that does not answer, whether the connection was still being made or the join was waiting for its answer. */
  signal?: AbortSignal;
}

/** What joining a home came to. */
export interface JoinedHome {
  /** Who the agent is on the gateway's roster. */
  member: Member;
  /** The version of Shrimpy the gateway runs. */
  gatewayVersion: string;
}

/**
 * Join the network from apart with an invitation link, as the agent whose home
 * is `home`. The home makes its token and keeps it first, as it does before it
 * links to any gateway, so that a join whose answer never arrives can be made
 * again with the same link and finds the same member. Its hello goes only to
 * the key the link names, and shows the gateway the name the link names, the
 * token, the code and the machine's name, and the home keeps who the gateway
 * says it is, the gateway's address and the fingerprint of its key. An agent
 * started from the home links to the gateway there from then on, and checks
 * its key each time. A home whose `agent.json` names another agent than the
 * link, and a home that is a member somewhere already, are refused before
 * anything is changed or sent. After that, a gateway that can't be reached,
 * that doesn't answer before `signal` aborts, that shows another key or that
 * turns the agent away is a `JoinFailedError`.
 */
export async function joinHome(home: string, link: string, options: JoinHomeOptions = {}): Promise<JoinedHome> {
  const invitation = readLink(link);
  if (invitation.name === null) {
    throw new Error(
      "The invitation names no agent, so it is for another machine of the person's own. An invitation for an agent has the agent's name in it.",
    );
  }
  const { name, paths } = loadHome(home);
  if (name !== invitation.name) {
    throw new Error(
      `The invitation is for an agent called ${invitation.name}, and the agent at ${paths.root} is called ${name}. ` +
        `Ask for an invitation for ${name}, or change the name in ${paths.config}.`,
    );
  }
  const saved = readMembership(paths.root);
  if (saved?.memberId !== undefined || saved?.gateway !== undefined) {
    const where = saved.gateway === undefined ? "the gateway on this machine" : `the gateway at ${formatAddress(saved.gateway)}`;
    throw new Error(
      `The agent ${name} is a member through ${where} already. To join anew, delete ${paths.member} and run this again.`,
    );
  }
  const token = saved?.token ?? newToken();
  if (saved === undefined) saveMembership(paths.root, { token });

  const where = formatAddress(invitation.address);
  const gateway: Entry = { ...invitation.address, fingerprint: invitation.fingerprint };
  const who = { kind: "join", name, token, code: invitation.code, machine: hostname() } as const;
  let answer: Welcome;
  try {
    const dialed = await dialGateway(gateway, who, options.signal === undefined ? {} : { signal: options.signal });
    dialed.linked.drop();
    answer = dialed.welcome;
  } catch (error) {
    if (error instanceof GatewayRefusedError) throw new JoinFailedError(`The gateway at ${where} did not let ${name} in: ${error.message}`);
    if (error instanceof UnknownAnswerError || error instanceof UnprovenGatewayError) throw new JoinFailedError(error.message);
    throw new JoinFailedError(`Could not join the gateway at ${where}: ${(error as Error).message}`, { cause: error });
  }
  if (answer.you === null) throw new JoinFailedError(`The gateway at ${where} let ${name} in as nobody.`);
  saveMembership(paths.root, { token, memberId: answer.you.id, gateway });
  return { member: answer.you, gatewayVersion: answer.shrimpy };
}
