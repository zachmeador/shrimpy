import { existsSync } from "node:fs";
import type { Facet, Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { Entry, LiveRoster, Principal, Revocation } from "../contracts/gateway/index.ts";
import { asError } from "../lib/errors/index.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { type Admissions, type ChatDelivery, markWorking, readFeed, type Wakes } from "./chat/index.ts";
import { homePaths } from "./home/index.ts";
import { type ChatCalls, followGateway, type LiveChat, linkToGateway, type LiveWorkspace, openChatLink } from "./links/index.ts";
import { createAgentHost } from "./server.ts";
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
  /** Call `listener` each time chat comes up. Returns what stops that. */
  onChat(listener: (live: LiveChat) => void): () => void;
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
  /** The agent's name, from `agent.json`, used when it first joins a roster. */
  name: string;
  /** The agent's home, where its membership is kept. */
  home: string;
  /** The agent's objects, loaded on its network host once the gateway welcomes it with its member ID. */
  facet: Facet<Principal>;
  /** The roster, which the agent holds at the gateway from now on. */
  roster: LiveRoster;
  /** The workspace context, which the agent holds at the gateway from now on. */
  workspace: LiveWorkspace;
  /** Where the agent stands in chat's feed, and how it takes an event up. */
  admissions: Admissions;
  /** What wakes the agent in each room. */
  wakes: Wakes;
  /** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
  working: Working;
  /** What the tasks that follow the events tell chat with. It is given the agent's way to chat. */
  delivery: ChatDelivery;
  /**
   * The program and arguments that run this Shrimpy, with which the agent runs
   * `shrimpy update` to follow its gateway to a newer release. Without it the
   * agent doesn't follow.
   */
  shrimpy?: readonly string[];
  /** Told that the gateway turned the agent away as removed, once its home notes it. */
  onRemoved: () => void;
  onError: (error: Error) => void;
}

/**
 * Take part in the network: keep the agent linked to the gateway, which is how
 * it is a member and how requests for it arrive at `agent({ id })`, hold the
 * roster, the workspace context and chat over that link, and take up the events
 * chat brings that wake the agent. Who the agent is comes from the gateway and
 * from nothing the agent says. None of it delays the agent's start or stops its sessions working: the
 * gateway and chat may not be there yet, or go away, and the agent finds them
 * again. Turned away as removed, the agent notes it in its home's membership,
 * so that it doesn't start or link again until it is let in again.
 */
export function join(participant: Participant, options: JoinOptions): Joined {
  const { name, facet, roster, workspace, admissions, wakes, working, delivery, onError } = participant;
  const paths = homePaths(participant.home);
  const backoff = options.backoff;
  const link = openChatLink(onError, options.chatCalls);
  let network: { id: string; host: Host<Principal, Revocation> } | undefined;

  const serve = async (memberId: string): Promise<Host<Principal, Revocation>> => {
    if (network?.id === memberId) return network.host;
    const host = await createAgentHost(memberId, facet, onError);
    const previous = network?.host;
    network = { id: memberId, host };
    roster.follow(host, BACKGROUND_CONTEXT);
    workspace.follow(host, BACKGROUND_CONTEXT);
    link.follow(host);
    await previous?.close(BACKGROUND_CONTEXT);
    return host;
  };

  const gateway = linkToGateway({
    serve,
    name,
    home: paths.root,
    membership: {
      read: () => readMembership(paths.root),
      save(membership) {
        // A removed agent's home is moved away while it runs: a new token would join as a new member under the freed name.
        if (!existsSync(paths.root)) throw new Error(`The home at ${paths.root} is gone, so the agent keeps no token there.`);
        saveMembership(paths.root, membership);
      },
    },
    files: { name: paths.config, membership: paths.member },
    onError,
    ...(participant.shrimpy === undefined ? {} : { follow: followGateway(participant.shrimpy, (line) => onError(new Error(line))) }),
    removed(words) {
      // A home moved away while the agent runs, as `shrimpy members remove` moves one, keeps nothing more.
      try {
        const kept = readMembership(paths.root);
        if (kept !== undefined && existsSync(paths.root)) saveMembership(paths.root, { ...kept, removed: { at: Date.now(), words } });
      } catch (error) {
        onError(asError(error));
      }
      participant.onRemoved();
    },
    ...(options.apart === undefined ? {} : { apart: options.apart }),
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
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
    onChat: (listener) => link.onUp(listener),
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
          workspace.close();
          await network?.host.close(BACKGROUND_CONTEXT);
        }
      }
    },
  };
}
