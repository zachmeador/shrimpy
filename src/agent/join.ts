import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { connectChat } from "../contracts/chat/index.ts";
import type { GatewayConnection, Transports } from "../contracts/gateway/index.ts";
import { localTransports } from "../contracts/gateway/node.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { homePaths } from "./home/index.ts";
import { startIntake, type Turns } from "./intake/index.ts";
import { joinGateway, type LiveChat, openChatLink } from "./links/index.ts";

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
  /** Stop reading chat's feed. Turns already taken carry on. */
  stopTaking(): void;
  /** Wait until the turns that have ended have been told to chat, or `signal` aborts. */
  drain(signal: AbortSignal): Promise<void>;
  /** Leave the gateway and chat. What was not delivered stays in the outbox for the next start. */
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
  turns: Turns;
  onError: (error: Error) => void;
}

/**
 * Take part in the network as the agent called `name`: be a member of the
 * roster and register with the gateway, keep a connection to chat, and turn the
 * events chat offers that wake the agent into turns. Who the agent is comes from the gateway and
 * from nothing the agent says. None of it delays the agent's start or stops
 * its sessions working: the gateway and chat may not be there yet, or go away,
 * and the agent finds them again.
 */
export function join(participant: Participant, options: JoinOptions): Joined {
  const { name, listening, turns, onError } = participant;
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
  const intake = startIntake({
    link,
    turns,
    onError,
    ...(backoff === undefined ? {} : { backoff }),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });

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
        try {
          await intake.close();
        } finally {
          await link.close();
        }
      }
    },
  };
}
