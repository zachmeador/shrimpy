import type { RosterEntry } from "../../contracts/gateway/index.ts";
import type { LiveChat } from "../links/index.ts";

/** What the message tools are handed: chat and the roster as the agent already has them. */
export interface MessageToolsOptions {
  /** What the agent's records are called. Every request ID the tools make carries it. */
  recordsId: string;
  /**
   * Chat as it is up right now, if it is. The tools never wait for it: with
   * none up they say chat is unreachable. Who the agent is comes with it.
   */
  chat(): LiveChat | undefined;
  /** Everyone on the roster, as the agent holds it, or undefined while the agent has not heard it. The tools look a name up in it. */
  roster(): readonly RosterEntry[] | undefined;
  /** Characters in the longest message the agent posts; a longer text is posted in parts. The most chat takes, if not given. */
  messageLimit?: number;
}
