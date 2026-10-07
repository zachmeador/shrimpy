import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { connectChat } from "../contracts/chat/index.ts";
import { type Address, entryTransports, type GatewayConnection } from "../contracts/gateway/index.ts";
import { localTransports } from "../contracts/gateway/node.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { type Admissions, type ChatDelivery, startIntake } from "./chat/index.ts";
import { homePaths } from "./home/index.ts";
import { answerCalls, joinGateway, type LiveChat, openChatLink } from "./links/index.ts";
import type { Working } from "./turns/index.ts";

export interface JoinOptions {
  /**
   * Where the gateway's network entry is, when the agent is apart from the
   * gateway, as one under another user or on another machine is. The agent
   * reaches the gateway, and chat through it, over the entry: the gateway can't
   * dial a socket here, so the agent registers with none, the roster says it is
   * running, and the gateway makes a call when someone asks for it, which the
   * agent answers by opening one more connection to the entry. The agent says
   * when it loses the gateway and when it is back, and asks the gateway
   * something every so often, since a gateway on another machine can stop
   * answering with its connection still open. By default the agent is beside
   * the gateway, reaches it over its Unix sockets on this machine, registers
   * the socket its server listens on, and says nothing of a gateway that is not
   * there.
   */
  apart?: Address;
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
  /**
   * Where the agent listens: its server ID, and the socket that connections
   * through the gateway come in on. An agent beside the gateway tells the gateway
   * the socket, to pipe connections to. One apart from the gateway tells it
   * none, and joins the connections it opens to answer calls to this socket.
   */
  listening: { serverId: string; socket: string };
  /** Where the agent stands in chat's feed, and how it takes an event up. */
  admissions: Admissions;
  /** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
  working: Working;
  /** What the tasks that follow the events tell chat with. It is given the agent's connection to chat. */
  delivery: ChatDelivery;
  onError: (error: Error) => void;
}

/**
 * Take part in the network as the agent called `name`: be a member of the
 * roster and register with the gateway, answer the calls the gateway makes for
 * it if it is apart from the gateway, keep a connection to chat, and take up
 * the events chat offers that wake the agent. Who the agent is comes from the
 * gateway and from nothing the agent says. None of it delays the agent's start
 * or stops its sessions working: the gateway and chat may not be there yet, or
 * go away, and the agent finds them again.
 */
export function join(participant: Participant, options: JoinOptions): Joined {
  const { name, listening, admissions, working, delivery, onError } = participant;
  const paths = homePaths(participant.home);
  const backoff = options.backoff;
  const reach = options.apart === undefined ? localTransports() : entryTransports(options.apart);
  const registration = joinGateway({
    name,
    listening: options.apart === undefined ? listening : { serverId: listening.serverId },
    membership: { read: () => readMembership(paths.root), save: (membership) => saveMembership(paths.root, membership) },
    files: { name: paths.config, membership: paths.member },
    onError,
    transportFactory: reach.gateway,
    ...(options.apart === undefined ? {} : { apart: options.apart }),
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
  const answering =
    options.apart === undefined
      ? undefined
      : answerCalls({
          gateway: registration,
          entry: options.apart,
          socket: listening.socket,
          onError,
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
        try {
          // The connections that answered calls end with it.
          await answering?.close();
        } finally {
          delivery.close();
          try {
            await intake.close();
          } finally {
            await link.close();
          }
        }
      }
    },
  };
}
