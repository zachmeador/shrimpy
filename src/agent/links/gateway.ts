import type { Membership } from "../../contracts/agent/index.ts";
import {
  type Address,
  formatAddress,
  type GatewayConnection,
  TURNED_AWAY,
  type TurnedAway,
  whyTurnedAway,
} from "../../contracts/gateway/index.ts";
import {
  type Heartbeat,
  type KeepRegisteredOptions,
  keepRegistered,
  type KeptRegistration,
  newToken,
} from "../../contracts/gateway/node.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
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
   * Where the gateway's entry is, when the agent is apart from the gateway. An
   * agent apart says when it loses the gateway and when it is back, and when
   * the gateway runs another version of Shrimpy. It is told to join again with a
   * new invitation when the gateway does not know its token, and it asks the
   * gateway something small every so often, since a gateway on another machine
   * can stop answering with its connection still open. An agent beside the
   * gateway needs none of that: its Unix socket closes when the gateway goes.
   */
  apart?: Address;
  /** How often an agent apart asks the gateway something, how long it waits for the answer, and how long it gives one try at getting in. Tests shorten them. */
  heartbeat?: Heartbeat;
  /**
   * What the agent tells the gateway about where it listens: the server ID it
   * answers as and the socket the gateway pipes connections to, which is the
   * one that asks for a ticket. An agent apart from the gateway has no socket
   * to tell, since the gateway can't dial one.
   */
  listening: { serverId: string; socket?: string };
  membership: MembershipStore;
  /** The file that says what the agent is called and the file that holds its token, for telling a person which to look at. */
  files: { name: string; membership: string };
  /**
   * Told, one line at a time, why the agent could not be a member, once for
   * each reason and not again while the same refusal repeats, and for an agent
   * apart where it stands with its gateway: that it can't reach it, that it is
   * back, and that it runs another version.
   */
  onError(error: Error): void;
}

/** The files of a home that a person is told to change, by their paths. */
type HomeFiles = GatewayLinkOptions["files"];

/**
 * What to do about a refusal from the gateway, in the paths of this home. The
 * gateway says what happened and knows nothing of the files, so this is the
 * agent's to say. A refusal the gateway did not name gets no advice. An agent
 * apart can only be let in again by an invitation.
 */
function adviceFor(why: TurnedAway | undefined, files: HomeFiles, apart: boolean): string | undefined {
  switch (why) {
    case TURNED_AWAY.nameTaken:
      return `Change the name in ${files.name} and start the agent again.`;
    case TURNED_AWAY.unknownToken:
      return apart
        ? `To join as a new member, delete ${files.membership}, get a new invitation and join again with it: shrimpy agent join <link>`
        : `To join as a new member, delete ${files.membership} and start the agent again.`;
    case TURNED_AWAY.agentRunning:
      return (
        `If this home is a copy that should be an agent of its own, stop it, delete ${files.membership}, ` +
        (apart
          ? `give it another name in ${files.name}, get a new invitation for that name and join with it: shrimpy agent join <link>`
          : `give it another name in ${files.name} and start it again.`)
      );
    case undefined:
      return undefined;
  }
}

/**
 * What an agent apart says of its gateway, for a person who only reads what it
 * prints: that it can't reach it, said once however long that lasts, that it is
 * back, said once it is registered again after it said it could not, and that
 * the gateway runs another version of Shrimpy, which is said for each
 * connection it registers on.
 */
function gatewayNews(gateway: Address, tell: (line: string) => void) {
  const where = formatAddress(gateway);
  let away = false;
  return {
    /** The agent can't reach the gateway, or has lost it. */
    cannotReach: (): void => {
      if (away) return;
      away = true;
      tell(`Can't reach the gateway at ${where}. This agent keeps trying.`);
    },
    /** The agent has registered on `connection`. */
    registered: (connection: GatewayConnection): void => {
      if (away) {
        away = false;
        tell(`The gateway at ${where} is back.`);
      }
      // Not waited for: the agent carries on whatever the gateway says, and whether it says anything.
      connection.version().then(
        (version) => {
          if (version === SHRIMPY_VERSION) return;
          tell(
            `The gateway at ${where} runs Shrimpy ${version}, but this agent runs ${SHRIMPY_VERSION}. ` +
              "Programs are meant to be upgraded together.",
          );
        },
        () => undefined,
      );
    },
  };
}

/**
 * Stay a member of the network and registered with the gateway as the agent
 * called `name`: the gateway on this machine, unless `transportFactory` reaches
 * another. The first time, the agent makes its token and keeps
 * it in its home before it asks to join, so that a join whose answer never
 * arrives is made again with the same token and finds the same member. Once the
 * gateway has said who it is, the agent keeps that too, and every time after
 * that it signs in with its token, which also renames it if its name has
 * changed. None of it delays or fails anything: the gateway may start after the
 * agent, and the agent finds it again each time it comes back. A refusal, at
 * joining, signing in or registering, is told once, with what to do about it
 * when the gateway names the case, and is told again only if it changes or the
 * agent has registered since. An agent apart says once that it can't reach the
 * gateway, however long that lasts, and once that it is back; one beside the
 * gateway says nothing of a gateway that is not there.
 */
export function joinGateway(options: GatewayLinkOptions): KeptRegistration {
  const { name, membership, files, apart } = options;
  let reported: string | undefined;
  const news = apart === undefined ? undefined : gatewayNews(apart, (line) => options.onError(new Error(line)));

  async function joinOrSignIn(gateway: GatewayConnection): Promise<void> {
    const saved = membership.read();
    const kept = saved ?? { token: newToken() };
    if (saved === undefined) membership.save(kept);
    if (kept.memberId === undefined) {
      const member = await gateway.join(name, kept.token);
      membership.save({ ...kept, memberId: member.id });
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
  function turnedAway(refusal: Error): string {
    const advice = adviceFor(whyTurnedAway(refusal), files, apart !== undefined);
    return `The gateway did not let ${name} in: ${refusal.message}${advice === undefined ? "" : ` ${advice}`}`;
  }

  return keepRegistered(
    {
      kind: "agent",
      serverId: options.listening.serverId,
      ...(options.listening.socket === undefined ? {} : { socket: options.listening.socket }),
      version: SHRIMPY_VERSION,
    },
    {
      transportFactory: options.transportFactory,
      backoff: options.backoff,
      signIn: joinOrSignIn,
      ...(news === undefined ? {} : { heartbeat: options.heartbeat ?? {}, onLost: news.cannotReach }),
      // A refusal that comes back after the agent has registered is a new one to tell.
      onRegistered(gateway) {
        reported = undefined;
        news?.registered(gateway);
      },
      onError(error) {
        // A connection that can't be made or that ended is the gateway being out of reach. An agent apart tells it once. One
        // beside the gateway says nothing and keeps trying, as it does while no gateway is listening.
        if (isDisconnected(error)) return news?.cannotReach();
        const told = `Could not join the network: ${isRefusal(error) ? turnedAway(error) : error.message}`;
        if (told === reported) return;
        reported = told;
        options.onError(new Error(told));
      },
    },
  );
}
