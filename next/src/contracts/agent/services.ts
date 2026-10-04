import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";
import type { SessionSummary, SessionView, Settlement } from "./view.ts";

/** Agent scope: which sessions exist, and which one this connection watches. */
export interface SessionDirectory {
  list(context: Context): Promise<SessionSummary[]>;
  /**
   * Watch the session behind a thread: the thread's ID is its address. A
   * thread the agent has no session for yet is refused, with a message that
   * says so. A connection watches one session at a time.
   */
  attach(threadId: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
}
export const SessionDirectory = defineService<SessionDirectory>("shrimpy.agent.sessions");

/** Session scope: the view of the attached session, and control over its work. */
export interface SessionService {
  readonly state: ReplicatedState<SessionView>;
  /**
   * Put input straight into the session; it joins running work. A retry with
   * the same `requestId` returns the first submission instead of a second one.
   */
  steer(text: string, requestId: string | null, context: Context): Promise<{ submission: number }>;
  /**
   * Resolve when the input that `steer` accepted has ended. It works after a
   * restart too. A client that goes away while waiting never stops the work.
   */
  wait(submission: number, context: Context): Promise<Settlement>;
  /** Stop the session's current work and withdraw input it has not picked up. */
  stop(context: Context): Promise<void>;
}
export const SessionService = defineService<SessionService>("shrimpy.agent.session");
