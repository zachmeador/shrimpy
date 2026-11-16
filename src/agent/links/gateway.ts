import type { Host } from "@earendil-works/chord";
import type { Membership } from "../../contracts/agent/index.ts";
import {
  type Entry,
  formatAddress,
  type Member,
  type Principal,
  type Reason,
  type Revocation,
} from "../../contracts/gateway/index.ts";
import {
  GatewayRefusedError,
  gatewaySocket,
  keepLinked,
  newToken,
  UnknownAnswerError,
  UnprovenGatewayError,
} from "../../contracts/gateway/node.ts";
import type { Backoff } from "../../lib/retry/index.ts";

/** Where the agent keeps who it is on the network between starts. */
export interface MembershipStore {
  /** What was kept, or undefined if the agent has not made a token yet. */
  read(): Membership | undefined;
  save(membership: Membership): void;
}

export interface GatewayLinkOptions {
  /** The agent's host, at `agent({ name })`, which has loaded. */
  host: Host<Principal, Revocation>;
  /** The name the agent asks the roster to call it, which is its host's address too. */
  name: string;
  /**
   * Where the gateway's entry is, when the agent is apart from the gateway,
   * with the fingerprint of the gateway's key that the agent checks it
   * against. An agent apart says when it loses the gateway and when it is back,
   * and is told to join again with a new invitation when the gateway does not
   * know its token. An agent beside the gateway links on the gateway's own
   * socket and says nothing of a gateway that is not there.
   */
  apart?: Entry;
  membership: MembershipStore;
  /** The file that says what the agent is called and the file that holds its token, for telling a person which to look at. */
  files: { name: string; membership: string };
  /**
   * Told, one line at a time, why the agent could not be a member, once for
   * each reason and not again while the same refusal repeats, and for an agent
   * apart where it stands with its gateway: that it can't reach it, and that it
   * is back.
   */
  onError(error: Error): void;
  /** The pauses between hellos. Tests shorten them. */
  backoff?: Backoff;
}

/** The agent's link to the gateway, kept. */
export interface GatewayLink {
  /** Who the gateway said the agent is at its last welcome, or undefined before the first. */
  you(): Member | undefined;
  /** Drop the link at once and stop linking. Resolves once it is gone. */
  close(): Promise<void>;
}

/** The files of a home that a person is told to change, by their paths. */
type HomeFiles = GatewayLinkOptions["files"];

/**
 * What to do about a refusal from the gateway, in the paths of this home. The
 * gateway says what happened and knows nothing of the files, so this is the
 * agent's to say. A refusal the gateway did not name gets no advice. An agent
 * apart can only be let in again by an invitation.
 */
function adviceFor(reason: Reason | null, files: HomeFiles, apart: boolean): string | undefined {
  switch (reason) {
    case "name_taken":
      return `Change the name in ${files.name} and start the agent again.`;
    case "unknown_token":
      return apart
        ? `To join as a new member, delete ${files.membership}, get a new invitation and join again with it: shrimpy join <link>`
        : `To join as a new member, delete ${files.membership} and start the agent again.`;
    case "agent_running":
      return (
        `If this home is a copy that should be an agent of its own, stop it, delete ${files.membership}, ` +
        (apart
          ? `give it another name in ${files.name}, get a new invitation for that name and join with it: shrimpy join <link>`
          : `give it another name in ${files.name} and start it again.`)
      );
    case null:
      return undefined;
  }
}

/**
 * Keep the agent linked to the gateway as the agent called `name`: on the
 * gateway's own socket beside it, or at its entry from apart. Its link is its
 * registration, requests for its objects arrive over it, and its own go up it,
 * as the agent. The first time, the agent makes its token and keeps it in its
 * home before its first hello, so that a hello whose answer never arrives is
 * said again with the same token and finds the same member. Once the gateway has
 * said who it is, the agent keeps that too. A name that differs from the
 * roster's renames it. None of it delays or fails anything: the gateway may
 * start after the agent, and the agent finds it again each time it comes back. A
 * refusal is told once, with what to do about it when the gateway names the
 * case, and is told again only if it changes or the agent has been let in since.
 * An agent apart says once that it can't reach the gateway, however long that
 * lasts, and once that it is back. It says hello only to the key it kept, so
 * an entry that doesn't prove it is the agent's gateway is told once, sent
 * nothing, and tried again, as one that can't be reached is.
 */
export function linkToGateway(options: GatewayLinkOptions): GatewayLink {
  const { name, membership, files, apart } = options;
  const where = apart === undefined ? undefined : formatAddress(apart);
  const tell = (line: string): void => options.onError(new Error(line));
  const stopping = new AbortController();
  let you: Member | undefined;
  let reported: string | undefined;
  let away = false;

  /** The token the home keeps, made and kept first if it has none. */
  const token = (): string => {
    const saved = membership.read();
    if (saved !== undefined) return saved.token;
    const made: Membership = { token: newToken(), ...(apart === undefined ? {} : { gateway: apart }) };
    membership.save(made);
    return made.token;
  };

  const linking = keepLinked({
    host: options.host,
    place: apart ?? { path: gatewaySocket() },
    who: () => ({ kind: "agent", name, token: token() }),
    signal: stopping.signal,
    onWelcome(answer) {
      reported = undefined;
      if (away && where !== undefined) tell(`The gateway at ${where} is back.`);
      away = false;
      if (answer.you === null) return;
      you = answer.you;
      const kept = membership.read();
      if (kept === undefined || kept.memberId === answer.you.id) return;
      // The gateway's word is who the token is: a home whose roster was replaced is a new member beside the gateway.
      if (kept.memberId !== undefined) {
        tell(`${files.membership} said this agent is ${kept.memberId}, and the gateway takes its token for ${answer.you.id}, which it keeps from now on.`);
      }
      membership.save({ ...kept, memberId: answer.you.id });
    },
    onError(error) {
      if (stopping.signal.aborted) return;
      if (error instanceof GatewayRefusedError) {
        const advice = adviceFor(error.reason, files, apart !== undefined);
        const told = `Could not join the network: the gateway did not let ${name} in: ${error.message}${advice === undefined ? "" : ` ${advice}`}`;
        if (told === reported) return;
        reported = told;
        tell(told);
        return;
      }
      if (error instanceof UnknownAnswerError || error instanceof UnprovenGatewayError) {
        if (error.message === reported) return;
        reported = error.message;
        // An agent apart says when its own gateway is back, as it does after one it couldn't reach.
        if (error instanceof UnprovenGatewayError) away = true;
        tell(error.message);
        return;
      }
      // Anything else is the gateway being out of reach. One beside it says nothing and keeps trying, as it does while
      // no gateway is listening.
      if (where === undefined || away) return;
      away = true;
      tell(`Can't reach the gateway at ${where}. This agent keeps trying.`);
    },
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
  });

  return {
    you: () => you,
    async close() {
      stopping.abort();
      await linking;
    },
  };
}
