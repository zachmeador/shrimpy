import { hostname } from "node:os";
import type { Membership } from "../../contracts/agent/index.ts";
import { loadHome, readMembership, saveMembership } from "../../contracts/agent/node.ts";
import { type Entry, HelloRefusedError, nameKey, readLink } from "../../contracts/gateway/index.ts";
import { newToken, UnprovenGatewayError } from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { type Joined, JoinFailedError, joinGateway } from "./join.ts";

export interface JoinHomeOptions {
  /** Abort to give up on a gateway that does not answer, whether the connection was still being made or the join was waiting for its answer. */
  signal?: AbortSignal;
}

const sameEntry = (a: Entry, b: Entry): boolean => formatAddress(a) === formatAddress(b) && a.fingerprint === b.fingerprint;

/**
 * Join the network from apart with an invitation link, as the agent whose home
 * is `home`, or replace its token and update its gateway key when the home has
 * joined already. The home keeps its pending token before it speaks to the
 * gateway so that a join whose answer never arrives can be tried again with the
 * same link and finds the same member, while leaving any existing membership
 * intact if the gateway refuses or shows the wrong key. A home whose
 * `agent.json` names another agent than the link is refused before anything is
 * changed or sent. After that, a gateway that can't be reached, that doesn't
 * answer before `signal` aborts, that shows another key or that turns the agent
 * away is a `JoinFailedError`.
 */
export async function joinHome(home: string, link: string, options: JoinHomeOptions = {}): Promise<Joined> {
  const invitation = readLink(link);
  if (invitation.name === null) {
    throw new Error(
      "The invitation names no agent, so it is for another machine of the person's own. An invitation for an agent has the agent's name in it.",
    );
  }
  const { name, paths } = loadHome(home);
  if (nameKey(name) !== nameKey(invitation.name)) {
    throw new Error(
      `The invitation is for an agent called ${invitation.name}, and the agent at ${paths.root} is called ${name}. ` +
        `Ask for an invitation for ${name}, or change the name in ${paths.config}.`,
    );
  }
  const gateway: Entry = { ...invitation.address, fingerprint: invitation.fingerprint };
  const saved = readMembership(paths.root);
  const existing = saved !== undefined && (saved.memberId !== undefined || saved.gateway !== undefined);
  const reuse = saved?.joining !== undefined && sameEntry(saved.joining.gateway, gateway);
  const token = reuse ? saved.joining!.token : newToken();
  if (!reuse) {
    const pending: Membership = existing
      ? { ...saved, joining: { token, gateway } }
      : { token, joining: { token, gateway } };
    saveMembership(paths.root, pending);
  }

  const who = { kind: "join", name: invitation.name, token, code: invitation.code, machine: hostname() } as const;
  let joined: Joined;
  try {
    joined = await joinGateway(gateway, who, invitation.name, options.signal);
  } catch (error) {
    // An explicit refusal or wrong gateway key means the gateway never took the pending token, so leave an existing membership clean.
    if (
      existing &&
      error instanceof JoinFailedError &&
      (error.cause instanceof HelloRefusedError || error.cause instanceof UnprovenGatewayError)
    ) {
      const { joining: _dropped, ...clean } = saved;
      saveMembership(paths.root, clean);
    }
    throw error;
  }
  saveMembership(paths.root, {
    token,
    memberId: joined.member.id,
    ...(joined.rosterId === null ? {} : { rosterId: joined.rosterId }),
    gateway,
  });
  return joined;
}
