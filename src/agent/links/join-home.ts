import { readMembership, saveMembership } from "../../contracts/agent/node.ts";
import {
  connectGateway,
  entryTransports,
  formatAddress,
  type Member,
  readLink,
} from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { loadHome } from "../home/index.ts";

/**
 * Join the network from apart with an invitation link, as the agent whose home
 * is `home`. The home makes its token and keeps it first, as it does before it
 * joins any gateway, so that a join whose answer never arrives can be made
 * again with the same link and finds the same member. It then shows the
 * gateway the link names the agent's name, the token and the code, and keeps
 * who the gateway says it is and the gateway's address. An agent started from
 * the home reaches the gateway and chat there from then on. A home whose
 * `agent.json` names another agent than the link, and a home that is a member
 * somewhere already, are refused before anything is changed or sent.
 */
export async function joinHome(home: string, link: string): Promise<Member> {
  const invitation = readLink(link);
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
  const gateway = await connectGateway({ transportFactory: entryTransports(invitation.address).gateway }).catch(
    (error: unknown) => {
      throw new Error(`Could not reach the gateway at ${where}: ${(error as Error).message}`, { cause: error });
    },
  );
  try {
    const member = await gateway.join(name, token, invitation.code);
    saveMembership(paths.root, { token, memberId: member.id, gateway: invitation.address });
    return member;
  } catch (error) {
    if (!isRefusal(error)) throw error;
    throw new Error(`The gateway at ${where} did not let ${name} in: ${error.message}`, { cause: error });
  } finally {
    await gateway.close().catch(() => undefined);
  }
}
