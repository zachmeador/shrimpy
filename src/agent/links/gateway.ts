import type { Membership } from "../../contracts/agent/index.ts";
import { type GatewayConnection, TURNED_AWAY, type TurnedAway, whyTurnedAway } from "../../contracts/gateway/index.ts";
import {
  type KeepRegisteredOptions,
  keepRegistered,
  type KeptRegistration,
  newToken,
} from "../../contracts/gateway/node.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** Where the agent keeps who it is on the network between starts. */
export interface MembershipStore {
  /** What was kept, or undefined if the agent has not made a token yet. */
  read(): Membership | undefined;
  save(membership: Membership): void;
}

export interface GatewayLinkOptions extends Pick<KeepRegisteredOptions, "transportFactory" | "backoff"> {
  /** The name the agent asks the roster to call it. */
  name: string;
  /**
   * What the agent tells the gateway about where it listens: the server ID it
   * answers as and the socket the gateway pipes connections to, which is the
   * one that asks for a ticket.
   */
  listening: { serverId: string; socket: string };
  membership: MembershipStore;
  /** The file that says what the agent is called and the file that holds its token, for telling a person which to look at. */
  files: { name: string; membership: string };
  /** Told why the agent could not be a member, once for each reason, and not again while the same refusal repeats. */
  onError(error: Error): void;
}

/** The files of a home that a person is told to change, by their paths. */
type HomeFiles = GatewayLinkOptions["files"];

/**
 * What to do about a refusal from the gateway, in the paths of this home. The
 * gateway says what happened and knows nothing of the files, so this is the
 * agent's to say. A refusal the gateway did not name gets no advice.
 */
function adviceFor(why: TurnedAway | undefined, files: HomeFiles): string | undefined {
  switch (why) {
    case TURNED_AWAY.nameTaken:
      return `Change the name in ${files.name} and start the agent again.`;
    case TURNED_AWAY.unknownToken:
      return `To join as a new member, delete ${files.membership} and start the agent again.`;
    case TURNED_AWAY.agentRunning:
      return (
        `If this home is a copy that should be an agent of its own, stop it, delete ${files.membership}, ` +
        `give it another name in ${files.name} and start it again.`
      );
    case undefined:
      return undefined;
  }
}

/**
 * Stay a member of the network and registered with this machine's gateway as
 * the agent called `name`. The first time, the agent makes its token and keeps
 * it in its home before it asks to join, so that a join whose answer never
 * arrives is made again with the same token and finds the same member. Once the
 * gateway has said who it is, the agent keeps that too, and every time after
 * that it signs in with its token, which also renames it if its name has
 * changed. None of it delays or fails anything: the gateway may start after the
 * agent, and the agent finds it again each time it comes back. A refusal, at
 * joining, signing in or registering, is told once, with what to do about it
 * when the gateway names the case, and is told again only if it changes or the
 * agent has registered since.
 */
export function joinGateway(options: GatewayLinkOptions): KeptRegistration {
  const { name, membership, files } = options;
  let reported: string | undefined;

  async function joinOrSignIn(gateway: GatewayConnection): Promise<void> {
    const saved = membership.read();
    const kept = saved ?? { token: newToken() };
    if (saved === undefined) membership.save(kept);
    if (kept.memberId === undefined) {
      const member = await gateway.join(name, kept.token);
      membership.save({ memberId: member.id, token: kept.token });
    } else {
      const member = await gateway.signIn(kept.token, name);
      if (member.id !== kept.memberId) {
        throw new Error(
          `${files.membership} says this agent is ${kept.memberId}, but the gateway says its token is ${member.id}.`,
        );
      }
    }
  }

  /** A refusal from the gateway, as a person is told of it. */
  function turnedAway(refusal: Error): Error {
    const advice = adviceFor(whyTurnedAway(refusal), files);
    return new Error(`The gateway did not let ${name} in: ${refusal.message}${advice === undefined ? "" : ` ${advice}`}`);
  }

  return keepRegistered(
    {
      kind: "agent",
      serverId: options.listening.serverId,
      socket: options.listening.socket,
      version: SHRIMPY_VERSION,
    },
    {
      transportFactory: options.transportFactory,
      backoff: options.backoff,
      signIn: joinOrSignIn,
      // A refusal that comes back after the agent has registered is a new one to tell.
      onRegistered() {
        reported = undefined;
      },
      onError(error) {
        const told = isRefusal(error) ? turnedAway(error) : error;
        if (told.message === reported) return;
        reported = told.message;
        options.onError(told);
      },
    },
  );
}
