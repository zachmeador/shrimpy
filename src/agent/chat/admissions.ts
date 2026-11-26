import type { ModelId } from "../../contracts/agent/index.ts";
import type { ChatInput, Watch, WatchResult } from "../inputs/index.ts";

/**
 * What chat needs from the agent's records: feed cursor, taking chat events up,
 * open watches and settling them, and stopping/choosing a model for commands.
 */
export interface Admissions {
  cursor(): Promise<number | undefined>;
  readingStore(store: string): Promise<boolean>;
  setCursor(seq: number): Promise<void>;
  admit(draft: Omit<ChatInput, "earlier" | "missed" | "breadcrumbs">, position?: number): Promise<void>;
  watches(): Promise<readonly Watch[]>;
  settleWatch(id: string, result: WatchResult, at: number, position: number): Promise<void>;
  looked(threadId: string): Promise<number | undefined>;
  stopWork(threadId: string): Promise<void>;
  modelOf(threadId: string): Promise<{ used: ModelId; home: ModelId }>;
  useModel(thread: { threadId: string; channelId: string }, model: ModelId | null): Promise<{ before: ModelId; now: ModelId }>;
}
