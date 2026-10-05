import type { GatewayConnection } from "../../../contracts/gateway/index.ts";
import type { LiveChat } from "../../links/index.ts";
import type { Wakeups } from "../../sessions/index.ts";

/** What the message tools are handed: the ways to chat and to the roster that the agent already has. */
export interface MessageToolsOptions {
  /** What the agent's records are called. Every request ID the tools make carries it. */
  recordsId: string;
  /**
   * The connection to chat that is up right now, if one is. The tools use the
   * agent's own connection and never open another, and they never wait for one:
   * with none up they say chat is unreachable. Who the agent is comes with it.
   */
  chat(): LiveChat | undefined;
  /**
   * The connection to the gateway that is up right now, if one is. The tools
   * look a name up in the roster over it, and never open another or wait for one.
   */
  gateway(): GatewayConnection | undefined;
  /** Characters in the longest message the agent posts; a longer text is posted in parts. The most chat takes, if not given. */
  messageLimit?: number;
}

/** What the tool that wakes the session later is handed: where the agent's wake-ups are kept. */
export interface WakeupToolsOptions {
  wakeups: Wakeups;
}
