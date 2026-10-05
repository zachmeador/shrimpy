import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { connectChat } from "../contracts/chat/index.ts";
import type { GatewayConnection, Transports } from "../contracts/gateway/index.ts";
import { localTransports } from "../contracts/gateway/node.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { type Admissions, startIntake } from "./chat/index.ts";
import { homePaths } from "./home/index.ts";
import { joinGateway, type LiveChat, openChatLink } from "./links/index.ts";
import type { Delivery, Working } from "./turns/index.ts";

export interface JoinOptions {
  /**
   * How to reach the gateway, and the chat server through it. By default the
   * gateway on this machine, over its Unix sockets; a gateway on another machine
   * is reached over transports to it.
   */
  reach?: Transports;
  /** Open the connection to chat over what the gateway offers. By default `connectChat`; a test wraps it. */
  connectChat?: typeof connectChat;
  /** The pauses between tries at reaching the gateway and chat, and at what fails meanwhile. Tests shorten them. */
  backoff?: () => Backoff;
  /** Characters in the longest message the agent posts. Tests shorten it. */
  messageLimit?: number;
}

/** The agent's part in the network, running. */
export interface Joined {
  /** The connection to the gateway that is up right now, if one is. The agent's tools look members up over it, and it says whose a ticket is. */
  gateway(): GatewayConnection | undefined;
  /** The connection to chat that is up right now, if one is. The agent's tools talk to chat over it. */
  chat(): LiveChat | undefined;
  /** Stop reading chat's feed. Events already taken up carry on. */
  stopTaking(): void;
  /** Wait until the turns that have ended have been told to chat, or `signal` aborts. */
  drain(signal: AbortSignal): Promise<void>;
  /** Leave the gateway and chat. What was not delivered waits in its task for the next start. */
  close(): Promise<void>;
}

/** What taking part in the network needs to know about the agent. */
export interface Participant {
  /** What the agent asks the roster to call it. */
  name: string;
  /** The agent's home, where its membership is kept. */
  home: string;
  /** What the gateway is told about where the agent listens: its server ID and the socket it pipes connections to. */
  listening: { serverId: string; socket: string };
  /** Where the agent stands in chat's feed, and how it takes an event up. */
  admissions: Admissions;
  /** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
  working: Working;
  /** What the tasks that follow the events tell chat with. It is given the agent's connection to chat. */
  delivery: Delivery;
  onError: (error: Error) => void;
}

/**
 * Take part in the network as the agent called `name`: be a member of the
 * roster and register with the gateway, keep a connection to chat, and take up
 * the events chat offers that wake the agent. Who the agent is comes from the
 * gateway and from nothing the agent says. None of it delays the agent's start
 * or stops its sessions working: the gateway and chat may not be there yet, or
 * go away, and the agent finds them again.
 */
export function join(participant: Participant, options: JoinOptions): Joined {
  const { name, listening, admissions, working, delivery, onError } = participant;
  const paths = homePaths(participant.home);
  const backoff = options.backoff;
  const reach = options.reach ?? localTransports();
  const registration = joinGateway({
    name,
    listening,
    membership: { read: () => readMembership(paths.root), save: (membership) => saveMembership(paths.root, membership) },
    files: { name: paths.config, membership: paths.member },
    onError: (error) => onError(new Error(`Could not join the network: ${error.message}`)),
    transportFactory: reach.gateway,
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
  const link = openChatLink({
    gateway: registration,
    transports: reach,
    ...(options.connectChat === undefined ? {} : { connect: options.connectChat }),
    onError,
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
  delivery.attach(link);
  const intake = startIntake({ link, admissions, working, onError, ...(backoff === undefined ? {} : { backoff }) });

  return {
    gateway: () => registration.current(),
    chat: () => link.current(),
    stopTaking: () => intake.stopTaking(),
    drain: (signal) => intake.drain(signal),
    async close() {
      try {
        // The gateway stops pointing at the agent first, so nobody is sent to one that is closing.
        await registration.stop();
      } finally {
        delivery.close();
        try {
          await intake.close();
        } finally {
          await link.close();
        }
      }
    },
  };
}
