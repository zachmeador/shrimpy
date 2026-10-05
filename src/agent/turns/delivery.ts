import type { Outstanding, TurnOutcome } from "../inputs/index.ts";
import type { ChatLink } from "../links/index.ts";

/** What goes back for an input, once the task that follows it knows how its turn ended. */
export interface Delivery {
  /** Give it the agent's way to chat. Until then, what is due waits. */
  attach(link: ChatLink): void;
  /**
   * Post the reply if there is one and, for a chat event, leave the receipt. It
   * waits for chat, and tries again after a failure, but a reply that chat
   * refuses for good is not posted: the receipt says it failed, with chat's
   * reason. A receipt that chat refuses for good is dropped. A wake-up or an
   * occurrence of a trigger has no receipt to carry a failure, or a reply that
   * chat refuses, so those are reported; and one in a session behind no thread
   * has no reply to post, so it never waits for chat. Every step names itself,
   * so doing all of it again after a crash posts nothing twice and changes no
   * receipt. It ends with a rejection only when `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<void>;
  /** The agent leaves chat. What is due stays where it is until the engine closes, and is told at the next start. */
  close(): void;
}
