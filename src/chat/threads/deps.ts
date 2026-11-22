import type { ChatEvent, Member, Message } from "../../contracts/chat/index.ts";
import type { Identity } from "../identity/index.ts";
import type { Store } from "../store/index.ts";
import type { WorkingMarks } from "./working.ts";

/**
 * What hears of each thing chat has just committed that may be worth telling
 * you, and decides whether it is, and when.
 */
export interface Notifier {
  /** A new message, not sent quietly. */
  posted(message: Message): void;
  /** `agent` left a receipt on each of `events` that says it failed, for `detail`. */
  failed(agent: Member, events: readonly ChatEvent[], detail: string): void;
}

/** What the chat operations run against. The clock is a parameter so tests can control time. */
export interface ChatDeps {
  readonly store: Store;
  readonly working: WorkingMarks;
  /** Who members are: the roster, asked through the gateway. */
  readonly identity: Identity;
  readonly notifier: Notifier;
  readonly now: () => number;
}
