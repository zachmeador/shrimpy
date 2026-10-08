import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";
import type {
  Member,
  Occurrence,
  Reloaded,
  SessionSummary,
  SessionView,
  Settlement,
  TriggerDetail,
  TriggerSummary,
} from "./view.ts";

/** Agent scope: which sessions exist, which one this connection watches, the agent's triggers, and the agent's home. */
export interface SessionDirectory {
  /**
   * Come in, before anything else, with a ticket the gateway made for this
   * agent. Nobody says who they are: the agent asks the gateway whose the ticket
   * is, keeps the answer with the connection, and answers with that member as
   * the roster has it now. What the member may do is the agent's to decide. A
   * ticket works once, so a caller that is refused gets another. While the
   * agent cannot reach the gateway it refuses to let anyone in, saying so.
   *
   * Only a connection that came through the gateway comes in this way, and it
   * must. A connection made by the home's path is the person who owns the home,
   * which the operating system has already decided, so it needs no ticket and
   * is refused if it offers one.
   */
  enter(ticket: string, context: Context): Promise<Member>;
  list(context: Context): Promise<SessionSummary[]>;
  /**
   * Watch a session by its address, which `list` gives: a thread's ID for a
   * session behind a thread, and `trigger:` and the trigger's name for a
   * trigger's own session. A session the agent has not made yet is refused,
   * with a message that says so. A connection watches one session at a time.
   */
  attach(session: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
  /**
   * Every standing trigger the agent has, in order of name, with its schedule,
   * whether it is on, when its next occurrence is due and how its last one
   * ended. The agent reads its triggers from the files of its home when it
   * starts and when it reloads, and this is what it runs now.
   */
  triggers(context: Context): Promise<TriggerSummary[]>;
  /**
   * One trigger with its definition and its most recent occurrences, newest
   * first, read from the agent's records. A trigger the agent does not have is
   * refused.
   */
  trigger(name: string, context: Context): Promise<TriggerDetail>;
  /**
   * Fire a trigger once now, apart from its schedule, which it keeps. Answers
   * with the occurrence it made, which has not ended yet unless it was skipped:
   * a trigger that does not allow overlap skips it while its last occurrence is
   * going. A trigger that is off can still be fired. A trigger with a check runs
   * it now, in a task of its own, and answers once that task exists, with the
   * occurrence the check will make, which has not ended: whatever the check
   * prints counts as news, whatever its `when` says, and the trigger's schedule
   * does not move. A trigger the agent does not have is refused.
   */
  fire(name: string, context: Context): Promise<Occurrence>;
  /**
   * Read the home's instructions, context files, skills, triggers and model
   * again. Each session uses what changed with its next request, and what it
   * already holds stays as it was. A trigger follows its file at once: a new
   * schedule counts from now, a new prompt is used from the next occurrence,
   * and a file that is gone or says `enabled: false` ends the trigger.
   *
   * The model is the one `agent.json` names, or else the folder's
   * `default-model.json`, and the servers it can be on are the ones the
   * `models.json` files declare now, so a server declared since the agent
   * started can be named. If the home names another model than its sessions
   * follow, every session follows the new one from its next request, whatever
   * model it was given before, and a session made later starts with it. If it
   * names the same one, no session changes.
   *
   * A file that cannot be used is left out and named in the answer, and never
   * makes the reload fail; a trigger whose file cannot be used keeps its last
   * valid definition. A model that cannot be used is named the same way, in the
   * words the agent's start would use, and the sessions keep the model they had.
   */
  reload(context: Context): Promise<Reloaded>;
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
