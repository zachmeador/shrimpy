import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";
import type { ConversationView } from "@earendil-works/pi-durable";

/** What a client needs from a thread: the committed view, updates, and two commands. The terminal and the browser both use this. */
export interface ThreadSource {
	readonly view: ConversationView;
	/** Calls `listener` now with the current view, then after every committed change. */
	subscribe(listener: (view: ConversationView) => void): () => void;
	/** `requestId` makes a retry after a lost reply return the first submission instead of admitting the text twice. */
	send(text: string, whenBusy: "steer" | "followUp", requestId?: string): Promise<{ submission: number }>;
	abort(): Promise<void>;
	close(): Promise<void>;
	/** Attached sources only: called once when the connection drops. Nothing reconnects by itself. */
	onDisconnect?(listener: (reason: Error | undefined) => void): void;
}

/** The one session this spike serves. A real host would list sessions through a directory service. */
export const THREAD_ID = "thread-1";

/** Server scope: choose which session this connection watches. */
export interface Sessions {
	attach(sessionId: string, context: Context): Promise<void>;
	detach(context: Context): Promise<void>;
}
export const Sessions = defineService<Sessions>("spike.sessions");

/** Session scope: the committed view of the thread, plus the two commands a client needs. */
export interface Thread {
	readonly state: ReplicatedState<ConversationView>;
	send(text: string, whenBusy: "steer" | "followUp", requestId: string | null, context: Context): Promise<{ submission: number }>;
	abort(context: Context): Promise<void>;
}
export const Thread = defineService<Thread>("spike.thread");
