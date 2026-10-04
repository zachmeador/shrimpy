import type { AgentEndpoint } from "../contracts/agent/index.ts";
import { agentMember } from "../contracts/chat/index.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { startIntake, type Turns } from "./intake/index.ts";
import { joinGateway, type OpenChat, openChatLink, openChatLocally } from "./links/index.ts";

export interface JoinOptions {
  /** The agent's name: who it is in chat, and what the gateway lists it as. */
  name: string;
  /** How to reach the chat server. By default through this machine's gateway, over Unix sockets. */
  openChat?: OpenChat;
  /** Register with this machine's gateway. On unless this says otherwise. */
  register?: boolean;
  /** The pauses between tries at reaching the gateway and chat, and at what fails meanwhile. Tests shorten them. */
  backoff?: () => Backoff;
  /** Characters in the longest message the agent posts. Tests shorten it. */
  messageLimit?: number;
}

/** The agent's part in the network, running. */
export interface Joined {
  /** Stop reading chat's feed. Turns already taken carry on. */
  stopTaking(): void;
  /** Wait until the turns that have ended have been told to chat, or `signal` aborts. */
  drain(signal: AbortSignal): Promise<void>;
  /** Leave the gateway and chat. What was not delivered stays in the outbox for the next start. */
  close(): Promise<void>;
}

/**
 * Take part in the network: register with the gateway, keep a connection to
 * chat, and turn the messages chat offers into turns. None of it delays the
 * agent's start or stops its sessions working: chat and the gateway may not be
 * there yet, or go away, and the agent finds them again.
 */
export function join(
  options: JoinOptions,
  endpoint: AgentEndpoint,
  turns: Turns,
  onError: (error: Error) => void,
): Joined {
  const self = agentMember(options.name);
  const backoff = options.backoff;
  const registration =
    options.register === false
      ? undefined
      : joinGateway(options.name, endpoint, {
          onError: (error) => onError(new Error(`Could not register with the gateway: ${error.message}`)),
          ...(backoff === undefined ? {} : { backoff: backoff() }),
        });
  const link = openChatLink({
    self,
    open: options.openChat ?? openChatLocally,
    onError,
    ...(backoff === undefined ? {} : { backoff: backoff() }),
  });
  const intake = startIntake({
    self,
    link,
    turns,
    onError,
    ...(backoff === undefined ? {} : { backoff }),
    ...(options.messageLimit === undefined ? {} : { messageLimit: options.messageLimit }),
  });

  return {
    stopTaking: () => intake.stopTaking(),
    drain: (signal) => intake.drain(signal),
    async close() {
      try {
        // The gateway stops pointing at the agent first, so nobody is sent to one that is closing.
        await registration?.stop();
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
