import type { RosterEntry } from "../../contracts/gateway/index.ts";
import type { KeptFiles } from "../home/index.ts";
import type { LiveChat } from "../links/index.ts";

/** Options handed to the `post`, `attach` and `thread` tools. */
export interface ChatToolsOptions {
  /** What the agent's records are called. Every request ID carries it. */
  recordsId: string;
  /** The agent's home, which a relative path to a file to send is in. */
  home: string;
  /** Chat as it is up right now, or undefined when disconnected. */
  chat(): LiveChat | undefined;
  /** Everyone on the roster, or undefined while not yet known. */
  roster(): readonly RosterEntry[] | undefined;
  /** Maximum characters per posted message (defaults to MAX_MESSAGE_LENGTH). */
  messageLimit?: number;
  /** The files that came with messages, saved in the home when the agent reads the messages. */
  files: KeptFiles;
}
