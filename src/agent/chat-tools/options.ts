import type { RosterEntry } from "../../contracts/gateway/index.ts";
import type { LiveChat } from "../links/index.ts";

/** Options handed to the `post` and `thread` tools. */
export interface ChatToolsOptions {
  /** What the agent's records are called. Every request ID carries it. */
  recordsId: string;
  /** Chat as it is up right now, or undefined when disconnected. */
  chat(): LiveChat | undefined;
  /** Everyone on the roster, or undefined while not yet known. */
  roster(): readonly RosterEntry[] | undefined;
  /** Maximum characters per posted message (defaults to MAX_MESSAGE_LENGTH). */
  messageLimit?: number;
}
