import type { Context, Draft, MutableReplicatedState } from "@earendil-works/chord";
import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type { ConversationView, EntryRecord, InboxState, LiveState } from "@earendil-works/pi-durable";
import type { Item, Status, ThreadView } from "./contract.ts";

/**
 * The one place that knows the engine's record shapes. It turns the committed session into the view clients show,
 * and runs on the server only: clients get `ThreadView` and never see an engine type.
 */

const textOf = (content: string | readonly { type: string; text?: string }[]): string =>
	typeof content === "string" ? content : content.map((block) => (block.type === "text" ? (block.text ?? "") : "[image]")).join("");

function assistantItem(message: AssistantMessage, streaming: boolean): Item {
	let text = "";
	let thinking = "";
	for (const block of message.content) {
		if (block.type === "text") text += block.text;
		else if (block.type === "thinking") thinking += block.thinking;
	}
	return { type: "assistant", text, thinking, streaming, stopReason: message.stopReason ?? null };
}

function toolItem(id: string, name: string, args: unknown, running: LiveState["tools"]): Item {
	const slot = running?.find((candidate) => candidate.callId === id);
	return {
		type: "tool",
		id,
		name,
		args: JSON.stringify(args),
		status: slot === undefined ? "pending" : slot.status === "running" ? "running" : "pending",
		output: slot?.output ?? "",
		notes: [],
	};
}

type Diagnostic = { code?: string; message: string };

/**
 * A result entry stores the content the model saw, which ends with a rendered <harness> block, and the structured
 * diagnostics in `data`. The view uses the structured form: `code: "interrupted"` is how recovery marks a tool it did not rerun.
 */
function finishTool(item: Item, entry: EntryRecord, result: ToolResultMessage): void {
	if (item.type !== "tool") return;
	const diagnostics = (entry.data as { diagnostics?: Diagnostic[] } | undefined)?.diagnostics ?? [];
	item.output = textOf(result.content).replace(/\n?<harness>[\s\S]*<\/harness>\s*$/, "");
	item.notes = diagnostics.map((diagnostic) => diagnostic.message);
	item.status = !result.isError ? "done" : diagnostics.some((diagnostic) => diagnostic.code === "interrupted") ? "interrupted" : "error";
}

function toItems(view: ConversationView): Item[] {
	const items: Item[] = [];
	const tools = new Map<string, Item>();
	const live = (view.docs["pi.live"] ?? {}) as LiveState;
	for (const entry of view.entries as readonly EntryRecord[]) {
		const message = entry.model?.[0] as Message | undefined;
		if (entry.kind === "pi.user" && message?.role === "user") {
			items.push({ type: "user", text: textOf(message.content as string) });
		} else if (entry.kind === "pi.assistant" && message?.role === "assistant") {
			items.push(assistantItem(message, false));
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				// Only a tool-calling answer runs its calls; an aborted or truncated one never does.
				const item = toolItem(block.id, block.name, block.arguments, live.tools);
				if (message.stopReason !== "toolUse") Object.assign(item, { status: "error", output: "Not run: the answer was interrupted." });
				tools.set(block.id, item);
				items.push(item);
			}
		} else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
			const item = tools.get(message.toolCallId);
			if (item !== undefined) finishTool(item, entry, message);
		} else if (entry.kind === "pi.reset") {
			items.push({ type: "marker", text: "new context" });
		} else if (entry.kind === "pi.compaction") {
			items.push({ type: "marker", text: "earlier context compacted" });
		}
	}
	const partial = live.generation?.message as AssistantMessage | undefined;
	if (partial !== undefined) {
		items.push(assistantItem(partial, true));
		for (const block of partial.content) if (block.type === "toolCall" && !tools.has(block.id)) items.push(toolItem(block.id, block.name, block.arguments, live.tools));
	}
	return items;
}

function toStatus(view: ConversationView): Status {
	const live = (view.docs["pi.live"] ?? {}) as LiveState;
	const inbox = (view.docs["pi.inbox"] ?? { items: [] }) as InboxState;
	const agent = (view.docs["pi.agent"] ?? {}) as { model?: { provider: string; modelId: string } };
	const usage = (view.docs["pi.usage"] ?? { models: {} }) as { models: Record<string, { input: number; output: number; cost: { total: number } }> };
	const running = live.tools?.find((slot) => slot.status === "running");
	const totals = Object.values(usage.models).reduce((sum, u) => ({ input: sum.input + u.input, output: sum.output + u.output, cost: sum.cost + u.cost.total }), { input: 0, output: 0, cost: 0 });
	let label = "idle";
	if (live.generation?.retry !== undefined) label = `retrying: ${live.generation.retry.error}`;
	else if (running !== undefined) label = `running ${running.name}`;
	else if (live.generation !== undefined) label = "model is answering";
	else if (live.run !== undefined) label = "working";
	return {
		label,
		busy: live.run !== undefined,
		queued: inbox.items.map((item) => `[${item.mode}] ${item.mode === "write" ? String(item.entry.kind) : textOf(item.content as string)}`),
		model: agent.model === undefined ? "no model" : `${agent.model.provider}/${agent.model.modelId}`,
		usage: `in ${totals.input} out ${totals.output} $${totals.cost.toFixed(4)}`,
	};
}

export function toThreadView(view: ConversationView): ThreadView {
	return { items: toItems(view), status: toStatus(view), entries: view.entries.length };
}

type Fields = Record<string, unknown>;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Copy changed fields. Text that only grew is appended, so a streaming answer travels as a string append instead of a full copy. */
function patchFields(draft: Fields, before: Fields, after: Fields): void {
	for (const key of Object.keys(after)) {
		const from = before[key];
		const to = after[key];
		if (typeof from === "string" && typeof to === "string" && to.length > from.length && to.startsWith(from)) draft[key] = (draft[key] as string) + to.slice(from.length);
		else if (!same(from, to)) draft[key] = to;
	}
}

/** Publish `next` as one revision, touching only what changed since the published view. */
export function publishThreadView(state: MutableReplicatedState<ThreadView>, next: ThreadView, context: Context): void {
	const before = state.value;
	if (same(before, next)) return;
	state.change(context, (draft: Draft<ThreadView>) => {
		const shared = Math.min(before.items.length, next.items.length);
		for (let index = 0; index < shared; index++) {
			const from = before.items[index]!;
			const to = next.items[index]!;
			if (from.type === to.type) patchFields(draft.items[index] as Fields, from as Fields, to as Fields);
			else draft.items[index] = to;
		}
		if (next.items.length > shared) draft.items.push(...next.items.slice(shared));
		else if (before.items.length > shared) draft.items.splice(shared);
		patchFields(draft.status as unknown as Fields, before.status as unknown as Fields, next.status as unknown as Fields);
		if (before.entries !== next.entries) draft.entries = next.entries;
	});
}
