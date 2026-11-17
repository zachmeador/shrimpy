import { hostname } from "node:os";
import { loadHome, readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Entry, readLink } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { type Joined, joinAnew, joinGateway } from "./join.ts";

export interface JoinHomeOptions {
  /** Abort to give up on a gateway that does not answer, whether the connection was still being made or the join was waiting for its answer. */
  signal?: AbortSignal;
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
export async function joinHome(home: string, link: string, options: JoinHomeOptions = {}): Promise<Joined> {
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
    throw new Error(`The agent ${name} is a member through ${where} already. ${joinAnew(paths.member)}`);
  }
  const token = saved?.token ?? newToken();
  if (saved === undefined) saveMembership(paths.root, { token });

  const gateway: Entry = { ...invitation.address, fingerprint: invitation.fingerprint };
  const who = { kind: "join", name, token, code: invitation.code, machine: hostname() } as const;
  const joined = await joinGateway(gateway, who, name, options.signal);
  saveMembership(paths.root, { token, memberId: joined.member.id, gateway });
  return joined;
}
