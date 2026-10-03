#!/usr/bin/env node
/**
 * Attach to a served home from Node, over the Unix socket or the WebSocket bridge, and show the same things the browser sees.
 *
 *   node scripts/headless-client.ts --home DIR [--ws] [--send TEXT] [--twice]
 *
 * Prints the snapshot, then one line per change in the item list, until the thread is idle after --send.
 * --twice sends the same request id two times and reports whether the server admitted the text once.
 * --die-after SECONDS kills this client with SIGKILL partway through, to see what the owner does about accepted work.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { attachUnix, attachWebSocket } from "../src/remote-node.ts";
import { type Item, toItems, toStatus } from "../src/view-model.ts";

const { values } = parseArgs({ options: { home: { type: "string" }, ws: { type: "boolean" }, send: { type: "string" }, twice: { type: "boolean" }, quiet: { type: "boolean" }, "die-after": { type: "string" } } });
const home = resolve(values.home!);
const started = performance.now();
const at = () => `${((performance.now() - started) / 1000).toFixed(2)}s`;
const say = (line: string) => console.log(`[${at()}] ${line}`);

const describe = (item: Item): string => {
	if (item.type === "user") return `user: ${JSON.stringify(item.text.slice(0, 50))}`;
	if (item.type === "marker") return `marker: ${item.text}`;
	if (item.type === "assistant") return `assistant${item.streaming ? " (streaming)" : ""}: ${item.thinking ? `[thinking ${item.thinking.length} chars] ` : ""}${JSON.stringify(item.text.slice(-40))}`;
	return `tool ${item.name} ${item.status}: ${JSON.stringify(item.output.slice(-40))}`;
};

const thread = await (values.ws ? attachWebSocket(home) : attachUnix(home));
say(`attached over ${values.ws ? "WebSocket" : "Unix socket"}; server ${thread.client.hello?.serverId}; attachment ${JSON.stringify(thread.client.attachment)}`);

const snapshot = toItems(thread.view);
say(`snapshot: ${snapshot.length} items, ${thread.view.entries.length} committed entries, ${toStatus(thread.view).model}`);
if (!values.quiet) for (const item of snapshot) say(`  ${describe(item)}`);

let last = snapshot.map(describe);
let updates = 0;
let sawBusy = false;
let idle: () => void = () => {};
const settled = new Promise<void>((resolve) => (idle = resolve));
thread.subscribe((view) => {
	const items = toItems(view);
	const lines = items.map(describe);
	const status = toStatus(view);
	if (status.busy) sawBusy = true;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i] !== last[i]) {
			updates++;
			if (!values.quiet || i >= last.length) say(`  update #${updates} item ${i}: ${lines[i]}`);
		}
	}
	last = lines;
	if (sawBusy && !status.busy) idle();
});

if (values["die-after"] !== undefined) {
	setTimeout(() => {
		say("SIGKILL to myself, mid-turn");
		process.kill(process.pid, "SIGKILL");
	}, Number(values["die-after"]) * 1000);
}
if (values.send !== undefined) {
	const requestId = `smoke-${Date.now()}`;
	const first = await thread.send(values.send, "steer", requestId);
	say(`sent ${JSON.stringify(values.send)} with request id ${requestId} -> submission ${first.submission}`);
	if (values.twice) {
		const second = await thread.send(values.send, "steer", requestId);
		say(`sent again with the same request id -> submission ${second.submission} (${second.submission === first.submission ? "same submission, admitted once" : "DIFFERENT submission"})`);
	}
	const timeout = setTimeout(() => {
		console.error("timed out waiting for idle");
		process.exit(1);
	}, 180_000);
	await settled;
	clearTimeout(timeout);
	const users = toItems(thread.view).filter((item) => item.type === "user").length;
	say(`idle. ${updates} item updates seen; the thread now has ${users} user messages and ${thread.view.entries.length} entries`);
}
const closing = performance.now();
await thread.close();
say(`closed in ${((performance.now() - closing) / 1000).toFixed(2)}s`);
