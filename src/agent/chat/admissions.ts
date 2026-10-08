import type { ModelId } from "../../contracts/agent/index.ts";
import type { ChatInput, Question, QuestionResult } from "../inputs/index.ts";
import type { WakePolicies } from "./policy.ts";

/**
 * What chat needs from the agent's records: where it stands in chat's feed and
 * in which chat store, a way to take an event up, which questions the agent has
 * open and a way to close one, and ways to stop the work behind a thread and to
 * choose its model, for the commands. It is also handed the choices the agent
 * made, in a file of its home, about what wakes it in each room.
 */
export interface Admissions {
  /** What wakes the agent in each room. Without it, every room has the default. */
  readonly wakes?: WakePolicies;
  /** Where the agent stands in chat's feed, kept with its own records. Undefined until it is first set. */
  cursor(): Promise<number | undefined>;
  /**
   * Say which chat store the agent is reading, which it asks chat each time it
   * connects, before it reads the feed. The cursor is kept with the ID of the
   * store it is in. When that is another store, or none, the cursor goes back to
   * the start in the same commit that keeps this ID, and this answers true. With
   * no cursor there is nothing to lose: the ID is kept with the first cursor that
   * is set, and with each one after it.
   */
  readingStore(store: string): Promise<boolean>;
  /** Move past events that wake nobody. */
  setCursor(seq: number): Promise<void>;
  /**
   * Take an event up: make its thread's session if the thread has none, start
   * the task that follows the event to its receipt, and move the cursor to
   * `position`, all in one commit. `position` is where the feed brought the
   * event, which is the event's own position unless it is a reply that a receipt
   * pointed to. The thread's earlier unacted events go with it, and so do the
   * wake-ups cancelled since the model last heard of them, the results of
   * questions the session was never shown and the breadcrumbs that are new to the
   * session. An event in a room,
   * one with a `backlog`, also moves where the agent has looked in its thread to
   * the event. An event that comes with its `place` has the session's record say
   * where its thread is, written again when it differs from what the record had.
   * An event is taken up once, because the cursor moves with it.
   */
  admit(draft: Omit<ChatInput, "earlier" | "cancelled" | "missed" | "breadcrumbs">, position?: number): Promise<void>;
  /**
   * The questions the agent asked other agents that still matter to what the
   * feed reads: the ones that are open, and the ones a look at chat closed while
   * the feed was behind what the look saw, which have `through`. What the agent
   * asked posts while its question is open belongs to the question, and its
   * receipt closes it.
   */
  questions(): Promise<readonly Question[]>;
  /**
   * Close the question `id` with what came back, and take that up as an input of
   * the session that asked, in one commit with the move of the cursor to
   * `position`, which is the receipt's own. A question that is not open any more,
   * because its time was up first, is left alone, and the cursor still moves. The
   * task that would have closed it when its time was up is ended afterwards.
   */
  closeQuestion(id: string, result: QuestionResult, position: number): Promise<void>;
  /**
   * Where the agent last looked in a thread of a room: the position of the
   * newest event it took up there, kept with the thread's session. Undefined
   * for a thread it has never been woken in. Everything the thread says after
   * that position is what the agent has not seen.
   */
  looked(threadId: string): Promise<number | undefined>;
  /**
   * Stop the work of the session behind a thread, as stopping it from a client
   * does: the turn that is running is stopped, the inputs that wait are taken
   * back, and the wake-ups the session waits on are cancelled. The inputs'
   * sources are told as they would be of any stop. It does nothing when the
   * agent has no session there or the session has nothing to stop, and it leaves
   * the agent's other sessions alone. It resolves once the work has stopped.
   */
  stopWork(threadId: string): Promise<void>;
  /**
   * The model the session behind a thread uses, and the one the agent's home
   * names, which a session follows until it is given another. A thread with no
   * session yet is to run on the home's.
   */
  modelOf(threadId: string): Promise<{ used: ModelId; home: ModelId }>;
  /**
   * Make the session behind a thread use `model` from its next request, or
   * follow the home's model again with null, for a command. A thread with no
   * session gets one first, as an event in it would make, so a command can be the
   * first thing written in a thread. A request that is running goes on as it
   * began. It lasts until the agent is started again or a reload finds the home
   * naming another model, as for any session. A model the agent can't use now is
   * refused, saying which it can, and nothing changes. Answers with the model
   * the session used before and the one it uses now.
   */
  useModel(thread: { threadId: string; channelId: string }, model: ModelId | null): Promise<{ before: ModelId; now: ModelId }>;
}
