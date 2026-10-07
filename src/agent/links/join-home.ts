import { readMembership, saveMembership } from "../../contracts/agent/node.ts";
import {
  connectGateway,
  formatAddress,
  type GatewayConnection,
  type Member,
  readLink,
} from "../../contracts/gateway/index.ts";
import { entryTransports, newToken } from "../../contracts/gateway/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { loadHome } from "../home/index.ts";

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
  /** The version of Shrimpy the gateway runs, when it said. */
  gatewayVersion: string | undefined;
}

/**
 * Join the network from apart with an invitation link, as the agent whose home
 * is `home`. The home makes its token and keeps it first, as it does before it
 * joins any gateway, so that a join whose answer never arrives can be made
 * again with the same link and finds the same member. It then shows the
 * gateway the link names the agent's name, the token and the code, and keeps
 * who the gateway says it is and the gateway's address. An agent started from
 * the home reaches the gateway and chat there from then on. A home whose
 * `agent.json` names another agent than the link, and a home that is a member
 * somewhere already, are refused before anything is changed or sent. After
 * that, a gateway that can't be reached, that doesn't answer before `signal`
 * aborts, or that turns the agent away is a `JoinFailedError`.
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

  const { signal } = options;
  const where = formatAddress(invitation.address);
  let gateway: GatewayConnection;
  try {
    gateway = await connectGateway({ transportFactory: entryTransports(invitation.address).gateway, signal });
  } catch (error) {
    throw new JoinFailedError(`Could not reach the gateway at ${where}: ${(error as Error).message}`, { cause: error });
  }
  // Closing the connection ends a call that is still waiting for its answer.
  const hangUp = (): void => void gateway.close().catch(() => undefined);
  signal?.addEventListener("abort", hangUp, { once: true });
  try {
    const member = await gateway.join(name, token, invitation.code).catch((error: unknown) => {
      throw new JoinFailedError(
        isRefusal(error)
          ? `The gateway at ${where} did not let ${name} in: ${error.message}`
          : `The gateway at ${where} stopped answering before ${name} was let in: ${(error as Error).message}`,
        { cause: error },
      );
    });
    saveMembership(paths.root, { token, memberId: member.id, gateway: invitation.address });
    // Once the agent is in, a gateway that won't say its version is no reason to say it failed.
    const gatewayVersion = await gateway.version().catch(() => undefined);
    return { member, gatewayVersion };
  } finally {
    signal?.removeEventListener("abort", hangUp);
    await gateway.close().catch(() => undefined);
  }
}
