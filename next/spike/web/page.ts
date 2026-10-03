import { connectThread, type RemoteThread, webSocketTransport } from "../src/remote.ts";
import { type Item, toItems, toStatus } from "../src/view-model.ts";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const chat = $("chat");
const text = $<HTMLInputElement>("text");
const errorLine = $("error");
let thread: RemoteThread | undefined;
let busy = false;
let items: Item[] = [];

const setConnection = (state: string): void => {
	document.body.dataset.connection = state;
	$("conn").textContent = state;
};

const el = (tag: string, className?: string, content?: string): HTMLElement => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (content !== undefined) node.textContent = content;
	return node;
};

function draw(item: Item): HTMLElement {
	if (item.type === "user") return el("div", "user", item.text);
	if (item.type === "marker") return el("div", "marker", item.text);
	if (item.type === "assistant") {
		const root = el("div", "assistant");
		if (item.thinking) root.append(el("div", "thinking", `thinking: ${item.thinking.trim()}`));
		if (item.text) root.append(el("pre", undefined, item.text));
		if (item.stopReason === "aborted") root.append(el("div", "marker", "(answer interrupted)"));
		return root;
	}
	const root = el("div", "tool");
	const header = el("header");
	header.append(el("b", undefined, item.name), ` ${item.args} `, el("span", item.status, item.status === "interrupted" ? "interrupted, not rerun" : item.status));
	root.append(header);
	if (item.output) root.append(el("pre", undefined, item.output));
	for (const note of item.notes) root.append(el("div", "marker", note));
	return root;
}

function render(): void {
	if (thread === undefined) return;
	const view = thread.view;
	items = toItems(view);
	const status = toStatus(view);
	busy = status.busy;
	const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
	chat.replaceChildren(...items.map(draw));
	if (nearBottom) chat.scrollTop = chat.scrollHeight;
	$("status").textContent = `${status.label} · ${status.model} · ${status.usage}`;
	$("queued").textContent = status.queued.map((line) => `queued ${line}`).join(" | ");
	document.body.dataset.busy = String(status.busy);
	document.body.dataset.items = String(items.length);
}

async function connect(attempt = 1): Promise<void> {
	setConnection(attempt === 1 ? "connecting" : `reconnecting (${attempt})`);
	try {
		const config = (await (await fetch("/config.json", { cache: "no-store" })).json()) as { serverId: string; sessionId: string };
		thread = await connectThread({ ...config, transportFactory: webSocketTransport(`ws://${location.host}/ws`) });
	} catch (error) {
		setConnection("failed");
		errorLine.textContent = `connect failed: ${error instanceof Error ? error.message : String(error)}`;
		setTimeout(() => void connect(attempt + 1), 1000);
		return;
	}
	errorLine.textContent = "";
	setConnection("connected");
	thread.subscribe(render);
	// The client never reconnects on its own: start over, which attaches again and fetches a fresh snapshot.
	thread.onDisconnect(() => {
		setConnection("disconnected");
		thread = undefined;
		setTimeout(() => void connect(1), 500);
	});
}

$("form").addEventListener("submit", (event) => {
	event.preventDefault();
	const message = text.value.trim();
	if (message === "" || thread === undefined) return;
	text.value = "";
	errorLine.textContent = "";
	// A retry after a lost reply reuses the request id, so the server admits the text once.
	thread.send(message, busy ? "followUp" : "steer", crypto.randomUUID()).catch((error: unknown) => {
		text.value = message;
		errorLine.textContent = `not sent: ${error instanceof Error ? error.message : String(error)}`;
	});
});
$("stop").addEventListener("click", () => void thread?.abort().catch((error: unknown) => (errorLine.textContent = `stop failed: ${String(error)}`)));

Object.assign(window, { __spike: { items: () => items, connected: () => thread?.client.connected ?? false } });
void connect();
