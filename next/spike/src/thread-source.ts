import type { ThreadSource } from "./contract.ts";
import { ctx, openHost } from "./host.ts";

/** The host and the client in one process, like coding-agent's local durable TUI. */
export async function openLocalThread(home: string, onReport?: (error: unknown) => void): Promise<ThreadSource> {
	const host = await openHost(home, { onReport });
	const state = await host.conversation.viewState(ctx);
	return {
		get view() {
			return state.value;
		},
		subscribe(listener) {
			listener(state.value);
			return state.subscribe((value) => listener(value));
		},
		async send(text, whenBusy, requestId) {
			const submission = await host.conversation.submit({ type: "input", content: text, whenBusy, requestId }, ctx);
			return { submission: submission.id };
		},
		abort: () => host.conversation.abort(ctx),
		async close() {
			state.dispose();
			await host.close();
		},
	};
}
