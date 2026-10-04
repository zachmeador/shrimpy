import type { Member } from "../../../contracts/chat/index.ts";
import type { LiveChat } from "../../links/index.ts";

/** What the message tools are handed: who the agent is in chat, and the way to chat it already has. */
export interface MessageToolsOptions {
  /** Who the agent is in chat. */
  self: Member;
  /**
   * The connection to chat that is up right now, if one is. The tools use the
   * agent's own connection and never open another, and they never wait for one:
   * with none up they say chat is unreachable.
   */
  chat(): LiveChat | undefined;
  /** Characters in the longest message the agent posts; a longer text is posted in parts. The most chat takes, if not given. */
  messageLimit?: number;
}
