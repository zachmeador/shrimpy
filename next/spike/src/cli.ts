#!/usr/bin/env node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { AssistantEntry, type LiveState, type SubmissionId } from "@earendil-works/pi-durable";
import { ctx, type Host, openHost } from "./host.ts";

const USAGE = `usage: cli.ts <command> [--home DIR] [args]

  send [--emit-checkpoints] [--request-id ID] <text>   submit input, wait until it settles, print the answer
  resume [--submission ID]                             reopen the home, continue unfinished work, wait until idle
  log [--json]                                         print the thread's entries (opens read-only)
  inspect                                              print unfinished tasks and submissions (opens read-only)
  tui [--attach] [--alt]                               terminal view of the thread; --attach joins the server that owns --home
  serve [--port N]                                     own the home and serve it on a Unix socket and a WebSocket bridge`;

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		home: { type: "string" },
		"emit-checkpoints": { type: "boolean" },
		"request-id": { type: "string" },
		submission: { type: "string" },
		json: { type: "boolean" },
		attach: { type: "boolean" },
		alt: { type: "boolean" },
		port: { type: "string" },
	},
});
const [command, ...rest] = positionals;
const home = resolve(values.home ?? process.env.SPIKE_HOME ?? mkdtempSync(join(tmpdir(), "shrimpy-spike-")));

const emit = (value: object): void => void process.stdout.write(`${JSON.stringify(value)}\n`);
const textOf = (message: Message | undefined): string => {
	if (message === undefined) return "";
	if (message.role === "assistant") {
		return message.content.map((block) => (block.type === "text" ? block.text : block.type === "toolCall" ? `[call ${block.name} ${JSON.stringify(block.arguments)}]` : "")).join("");
	}
	if (typeof message.content === "string") return message.content;
	return message.content.map((block) => (block.type === "text" ? block.text : "[image]")).join("");
};

/** Print a JSON line when the committed view first shows a partial answer or a running tool, so a test can kill the host there. */
async function emitCheckpoints(host: Host): Promise<void> {
	const view = await host.conversation.viewState(ctx);
	let streamed = false;
	let tooled = false;
	view.subscribe((value) => {
		const live = (value.docs["pi.live"] ?? {}) as LiveState;
		const partial = live.generation?.message as AssistantMessage | undefined;
		const text = partial?.content.map((block) => (block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : "")).join("") ?? "";
		if (!streamed && text.length >= 60) {
			streamed = true;
			emit({ event: "checkpoint", kind: "streaming", partialChars: text.length });
		}
		const running = live.tools?.find((slot) => slot.status === "running" && (slot.output ?? "").includes("started"));
		if (!tooled && running !== undefined) {
			tooled = true;
			emit({ event: "checkpoint", kind: "tool-running", tool: running.name, output: running.output });
		}
	});
}

async function printEntries(host: Host, json: boolean): Promise<void> {
	const page = await host.conversation.entries({}, 500, undefined, ctx);
	for (const entry of [...page.items].reverse()) {
		if (json) {
			emit(entry);
			continue;
		}
		const message = entry.model?.[0];
		const extras =
			message?.role === "assistant"
				? ` stop=${message.stopReason}`
				: message?.role === "toolResult"
					? ` tool=${message.toolName} isError=${message.isError}`
					: "";
		console.log(`#${entry.id} ${entry.kind}${extras} ${JSON.stringify(textOf(message).slice(0, 300))}`);
	}
}

async function settle(host: Host, id: SubmissionId): Promise<"done" | "unanswered"> {
	const submission = await host.harness.submission(id, ctx);
	if (submission === undefined) throw new Error(`Unknown submission ${id}`);
	const settled = await submission.wait(ctx);
	const answer = settled.status === "done" && settled.type === "input" ? await host.conversation.commit((tx) => tx.entry(AssistantEntry, settled.answer), ctx) : undefined;
	emit({
		event: "settled",
		submission: id,
		status: settled.status,
		...(settled.status === "unanswered" ? { reason: settled.reason } : {}),
		answer: textOf(answer?.model?.[0]).slice(0, 300),
	});
	return settled.status;
}

async function main(): Promise<number> {
	switch (command) {
		case "send": {
			const host = await openHost(home);
			emit({ event: "opened", home, pid: process.pid });
			if (values["emit-checkpoints"]) await emitCheckpoints(host);
			const submission = await host.conversation.submit({ type: "input", content: rest.join(" "), requestId: values["request-id"] }, ctx);
			emit({ event: "submitted", submission: submission.id });
			const status = await settle(host, submission.id);
			await host.close();
			// Like the plan's `shrimpy run`: 0 when answered, 1 when the turn ended without an answer.
			return status === "done" ? 0 : 1;
		}
		case "resume": {
			const host = await openHost(home);
			emit({ event: "opened", home, pid: process.pid });
			if (values.submission !== undefined) await settle(host, Number(values.submission) as SubmissionId);
			await host.conversation.waitForIdle(ctx);
			emit({ event: "idle", pending: (await host.harness.inspect(ctx)).submissions.length });
			await host.close();
			return 0;
		}
		case "log": {
			const host = await openHost(home, { resume: false });
			await printEntries(host, values.json === true);
			await host.close();
			return 0;
		}
		case "inspect": {
			const host = await openHost(home, { resume: false });
			const inspection = await host.harness.inspect(ctx);
			console.log(JSON.stringify({ scheduling: inspection.scheduling, tasks: inspection.tasks.map((t) => ({ kind: t.record.kind, state: t.state.kind, taskState: t.record.state })), submissions: inspection.submissions }, null, 1));
			await host.close();
			return 0;
		}
		case "tui": {
			const { runTui } = await import("./tui.ts");
			return runTui({ home, attach: values.attach === true, alt: values.alt === true });
		}
		case "serve": {
			const { serve } = await import("./serve.ts");
			return serve({ home, port: values.port === undefined ? undefined : Number(values.port) });
		}
		default:
			console.error(USAGE);
			return 2;
	}
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
