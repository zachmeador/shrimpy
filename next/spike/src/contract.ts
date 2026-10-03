import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";

/** One thing a client draws. */
export type Item =
	| { type: "user"; text: string }
	| { type: "assistant"; text: string; thinking: string; streaming: boolean; stopReason: string | null }
	| { type: "tool"; id: string; name: string; args: string; status: "pending" | "running" | "done" | "error" | "interrupted"; output: string; notes: string[] }
	| { type: "marker"; text: string };

export interface Status {
	/** "idle", or what the thread is doing now. */
	label: string;
	busy: boolean;
	queued: string[];
	model: string;
	usage: string;
}

/**
 * What crosses the wire: the thread as clients show it. The server builds it from the committed session, so a
 * reopened client shows the same thing, and no client depends on the engine's own record shapes.
 */
export interface ThreadView {
	items: Item[];
	status: Status;
	/** How many committed entries the session holds. */
	entries: number;
}

/** What a client needs from a thread: its view, updates, and two commands. The terminal and the browser both use this. */
export interface ThreadSource {
	readonly view: ThreadView;
	/** Calls `listener` now with the current view, then after every committed change. */
	subscribe(listener: (view: ThreadView) => void): () => void;
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

/** Session scope: the thread's view, plus the two commands a client needs. */
export interface Thread {
	readonly state: ReplicatedState<ThreadView>;
	send(text: string, whenBusy: "steer" | "followUp", requestId: string | null, context: Context): Promise<{ submission: number }>;
	abort(context: Context): Promise<void>;
}
export const Thread = defineService<Thread>("spike.thread");
