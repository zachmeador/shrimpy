import type { Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { Entry, LiveRoster, Principal, Revocation } from "../contracts/gateway/index.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { type Admissions, type ChatDelivery, markWorking, readFeed, type Wakes } from "./chat/index.ts";
import { homePaths } from "./home/index.ts";
import { type ChatCalls, type LiveChat, linkToGateway, openChatLink } from "./links/index.ts";
import type { Working } from "./turns/index.ts";

export interface JoinOptions {
  /**
   * Where the gateway's entry is, when the agent is apart from the gateway, as
   * one under another user or on another machine is, with the fingerprint of
   * the gateway's key. The agent links to the gateway there once its key proves
   * it, with its token, and reaches chat through it. It says when it loses the
   * gateway and when it is back. By default the agent is beside the gateway and
   * links on the gateway's own socket, and says nothing of a gateway that is
   * not there.
   */
  apart?: Entry;
  /** The pauses between tries at reaching the gateway and chat, and at what fails meanwhile. Tests shorten them. */
  backoff?: () => Backoff;
  /** Characters in the longest message the agent posts. Tests shorten it. */
  messageLimit?: number;
  /** Stand between the agent and chat's calls. Tests use it to make some of them go wrong. */
  chatCalls?: (calls: ChatCalls) => ChatCalls;
}

/** The agent's part in the network, running. */
export interface Joined {
  /** Chat as it is up right now, if it is. The agent's tools talk to chat over it. */
  chat(): LiveChat | undefined;
  /** Stop reading chat's feed. Events already taken up carry on. */
  stopTaking(): void;
  /**
   * Wait until the turns that have ended have been told to chat, or `signal`
   * aborts, or chat is lost, since nothing can be told to chat that is not there.
   * A turn still running is not waited for.
   */
  drain(signal: AbortSignal): Promise<void>;
  /** Leave the gateway and chat. What was not delivered waits in its task for the next start. */
  close(): Promise<void>;
}

/** What taking part in the network needs to know about the agent. */
export interface Participant {
  /** What the agent asks the roster to call it, which its host's address is for. */
  name: string;
  /** The agent's home, where its membership is kept. */
  home: string;
  /** The agent's host, which has loaded: its link to the gateway, and every hold it makes over it, is the agent's. */
  host: Host<Principal, Revocation>;
  /** The roster, which the agent holds at the gateway from now on. */
  roster: LiveRoster;
  /** Where the agent stands in chat's feed, and how it takes an event up. */
  admissions: Admissions;
  /** What wakes the agent in each room. */
  wakes: Wakes;
  /** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
  working: Working;
  /** What the tasks that follow the events tell chat with. It is given the agent's way to chat. */
  delivery: ChatDelivery;
  onError: (error: Error) => void;
}

/**
 * Take part in the network as the agent called `name`: keep the agent's host
 * linked to the gateway, which is how it is a member and how requests for it
 * arrive, hold the roster and chat over that link, and take up the events chat
 * brings that wake the agent. Who the agent is comes from the gateway and from
 * nothing the agent says. None of it delays the agent's start or stops its
 * sessions working: the gateway and chat may not be there yet, or go away, and
 * the agent finds them again.
 */
export function join(participant: Participant, options: JoinOptions): Joined {
  const { name, host, roster, admissions, wakes, working, delivery, onError } = participant;
  const paths = homePaths(participant.home);
  const backoff = options.backoff;
  const gateway = linkToGateway({
    host,
    name,
    membership: { read: () => readMembership(paths.root), save: (membership) => saveMembership(paths.root, membership) },
    files: { name: paths.config, membership: paths.member },
    onError,
    ...(options.apart === undefined ? {} : { apart: options.apart }),
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
  roster.follow(host, BACKGROUND_CONTEXT);
  const link = openChatLink(host, onError, options.chatCalls);
  delivery.attach(link);
  const stopMarking = markWorking(link, working, onError);
  const taking = new AbortController();
  const reading = readFeed({
    link,
    admissions,
    wakeIn: (room) => wakes.of(room),
    onError,
    stop: taking.signal,
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });

  return {
    chat: () => link.current(),
    stopTaking: () => taking.abort(),
    async drain(signal) {
      const live = link.current();
      if (live !== undefined) await working.untilTold(AbortSignal.any([signal, live.lost]));
    },
    async close() {
      try {
        // The agent's link goes first, so the gateway stops sending anyone to an agent that is closing.
        await gateway.close();
      } finally {
        delivery.close();
        taking.abort();
        stopMarking();
        try {
          await reading;
        } finally {
          await link.close();
          roster.close();
        }
      }
    },
  };
}
