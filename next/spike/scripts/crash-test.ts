#!/usr/bin/env node
/**
 * Question 1: kill the durable host with SIGKILL mid-stream and mid-tool, restart it on the same SQLite file,
 * and check that the model request is sent again and the interrupted tool is reported, not rerun.
 *
 * node scripts/crash-test.ts                 faux provider, deterministic timing
 * SPIKE_LOCAL_URL=... SPIKE_LOCAL_MODEL=... node scripts/crash-test.ts --real    the same two kills against a real model
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const real = process.argv.includes("--real");
const scenarioFilter = process.argv.find((arg) => arg === "stream" || arg === "tool");

type Line = Record<string, any>;
interface Run {
	pid: number;
	lines: Line[];
	code: number | null;
	signal: NodeJS.Signals | null;
	stderr: string;
}

/** Run the CLI; SIGKILL it as soon as `killOn` matches one of its JSON lines. */
function run(args: string[], env: Record<string, string>, killOn?: (line: Line) => boolean): Promise<Run> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
		const lines: Line[] = [];
		let buffer = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`timed out: ${args.join(" ")}`));
		}, 240_000);
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.stdout.on("data", (chunk) => {
			buffer += chunk;
			for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
				const text = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				let line: Line;
				try {
					line = JSON.parse(text);
				} catch {
					continue;
				}
				lines.push(line);
				if (killOn?.(line)) child.kill("SIGKILL");
			}
		});
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			clearTimeout(timer);
			resolve({ pid: child.pid!, lines, code, signal, stderr });
		});
	});
}

const text = async (args: string[], env: Record<string, string>): Promise<string> => {
	const output: string[] = [];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
		child.stdout.on("data", (chunk) => output.push(String(chunk)));
		child.on("error", reject);
		child.on("exit", () => resolve());
	});
	return output.join("");
};

const jsonl = (file: string): Line[] => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((row) => JSON.parse(row)) : []);
const heading = (title: string): void => console.log(`\n== ${title} ==`);
const show = (label: string, value: unknown): void => console.log(`${label.padEnd(26)}${typeof value === "string" ? value : JSON.stringify(value)}`);

/** The faux script and speed; a real run takes its provider from SPIKE_LOCAL_URL and SPIKE_LOCAL_MODEL in the environment. */
const providerEnv = (scenario: string, tps: number): Record<string, string> => (real ? {} : { SPIKE_SCENARIO: scenario, SPIKE_TPS: String(tps) });

async function entriesOf(home: string, env: Record<string, string>): Promise<Line[]> {
	const out = await text(["log", "--json", "--home", home], env);
	return out.trim().split("\n").filter(Boolean).map((row) => JSON.parse(row));
}

const assistantBlocks = (entry: Line): string => entry.model[0].content.map((block: Line) => block.text ?? block.thinking ?? `[call ${block.name}]`).join("");

async function streamScenario(): Promise<void> {
	heading(`scenario 1: kill the host while the model is streaming (${real ? "real model" : "faux provider"})`);
	const home = mkdtempSync(join(tmpdir(), "spike-stream-"));
	const env: Record<string, string> = real ? { SPIKE_LOG_HTTP: join(home, "http.jsonl") } : {};
	const prompt = real ? "Count from 1 to 60, one number per line, with a short comment on each line." : "stream a long answer";

	const first = await run(["send", "--emit-checkpoints", "--home", home, prompt], { ...providerEnv("stream", 40), ...env }, (line) => line.event === "checkpoint");
	const submission = first.lines.find((line) => line.event === "submitted")?.submission as number;
	const checkpoint = first.lines.find((line) => line.event === "checkpoint")!;
	show("first run", `pid ${first.pid} submitted #${submission}; committed partial of ${checkpoint.partialChars} chars; SIGKILL`);
	assert.equal(first.signal, "SIGKILL");
	assert.equal(first.lines.some((line) => line.event === "settled"), false);

	const inspected = JSON.parse(await text(["inspect", "--home", home], providerEnv("stream", 40)));
	show("after kill, unfinished", { submissions: inspected.submissions.map((s: Line) => ({ id: s.id, status: s.status })), tasks: inspected.tasks.map((t: Line) => `${t.kind}:${t.state}`) });
	assert.equal(inspected.submissions.length, 1);

	const second = await run(["resume", "--home", home, "--submission", String(submission)], { ...providerEnv("stream", 4000), ...env });
	const settled = second.lines.find((line) => line.event === "settled")!;
	show("second run", `pid ${second.pid} reopened; submission #${submission} settled ${settled.status}`);
	assert.equal(second.code, 0, second.stderr);
	assert.equal(settled.status, "done");

	const entries = await entriesOf(home, providerEnv("stream", 4000));
	const users = entries.filter((entry) => entry.kind === "pi.user");
	const assistants = entries.filter((entry) => entry.kind === "pi.assistant");
	show("entries", entries.map((entry) => `${entry.kind}${entry.model?.[0]?.stopReason ? `(${entry.model[0].stopReason})` : ""}`).join(" "));
	assert.equal(users.length, 1, "the input is not duplicated");
	const aborted = assistants.find((entry) => entry.model[0].stopReason === "aborted");
	assert.ok(aborted, "the partial stream is kept as an aborted assistant entry");
	show("kept partial", `${JSON.stringify(assistantBlocks(aborted).slice(0, 70))} (${assistantBlocks(aborted).length} chars)`);
	assert.equal(assistants.at(-1)!.model[0].stopReason, "stop");

	if (real) {
		const bodies = jsonl(join(home, "http.jsonl"));
		show("wire requests", `${bodies.length} POSTs from pids ${[...new Set(bodies.map((row) => row.pid))].join(", ")}`);
		assert.equal(bodies.length, 2);
		assert.deepEqual(bodies[0]!.body.messages, bodies[1]!.body.messages, "the resent request carries the same messages");
		show("same messages on the wire", true);
	} else {
		const requests = jsonl(join(home, "requests.jsonl"));
		show("model requests", requests.map((row) => `pid ${row.pid} ${row.messages} msgs digest ${row.digest}`));
		assert.equal(requests.length, 2, "the provider received the request twice");
		assert.notEqual(requests[0]!.pid, requests[1]!.pid);
		assert.equal(requests[0]!.digest, requests[1]!.digest, "the resent request carries the same messages");
		show("same messages in both", true);
	}
	console.log("PASS: the request was sent again; the partial stream is preserved; the input is not duplicated");
}

async function toolScenario(): Promise<void> {
	heading(`scenario 2: kill the host while a shell tool runs (${real ? "real model" : "faux provider"})`);
	const home = mkdtempSync(join(tmpdir(), "spike-tool-"));
	const env: Record<string, string> = real ? { SPIKE_LOG_HTTP: join(home, "http.jsonl") } : {};
	const slow = 'echo "$$" > child.pid; echo "attempt" >> runs.log; echo started; sleep 8; echo finished >> runs.log';
	const prompt = real ? `Use the bash tool to run exactly this command, then tell me what happened: ${slow}` : "run the slow command";

	const first = await run(["send", "--emit-checkpoints", "--home", home, prompt], { ...providerEnv("tool", 4000), ...env }, (line) => line.event === "checkpoint" && line.kind === "tool-running");
	const submission = first.lines.find((line) => line.event === "submitted")?.submission as number;
	show("first run", `pid ${first.pid} submitted #${submission}; bash printed "started"; SIGKILL`);
	assert.equal(first.signal, "SIGKILL");
	const work = join(home, "work");
	const childPid = Number(readFileSync(join(work, "child.pid"), "utf8").trim());
	let orphanAlive = false;
	try {
		process.kill(childPid, 0);
		orphanAlive = true;
	} catch {}
	show("shell child after kill", orphanAlive ? `pid ${childPid} is still running (detached process group)` : `pid ${childPid} is gone`);

	const inspected = JSON.parse(await text(["inspect", "--home", home], providerEnv("tool", 4000)));
	show("after kill, unfinished", { submissions: inspected.submissions.map((s: Line) => ({ id: s.id, status: s.status })), tasks: inspected.tasks.map((t: Line) => `${t.kind}:${t.state}`) });

	const second = await run(["resume", "--home", home, "--submission", String(submission)], { ...providerEnv("tool", 4000), ...env });
	const settled = second.lines.find((line) => line.event === "settled")!;
	show("second run", `pid ${second.pid} reopened; submission #${submission} settled ${settled.status}`);
	assert.equal(second.code, 0, second.stderr);
	assert.equal(settled.status, "done");

	const attempts = readFileSync(join(work, "runs.log"), "utf8").split("\n").filter((row) => row.startsWith("attempt")).length;
	show("tool executions", `${attempts} (runs.log has ${attempts} "attempt" line)`);
	assert.equal(attempts, 1, "the interrupted tool is not rerun");

	const entries = await entriesOf(home, providerEnv("tool", 4000));
	const result = entries.find((entry) => entry.kind === "pi.tool-result")!.model[0];
	const resultText = result.content.map((block: Line) => block.text).join("");
	show("tool result entry", { isError: result.isError, text: resultText });
	assert.equal(result.isError, true);
	assert.match(resultText, /started/, "output committed before the kill is retained");
	assert.match(resultText, /was interrupted and may have partially run/);
	show("final answer", assistantBlocks(entries.filter((entry) => entry.kind === "pi.assistant").at(-1)!).slice(0, 200));

	if (real) {
		const bodies = jsonl(join(home, "http.jsonl"));
		show("wire requests", `${bodies.length} POSTs from pids ${bodies.map((row) => row.pid).join(", ")}`);
		const roles = bodies.at(-1)!.body.messages.map((m: Line) => m.role).join(",");
		show("last request roles", roles);
	} else {
		const requests = jsonl(join(home, "requests.jsonl"));
		show("model requests", requests.map((row) => `pid ${row.pid} roles ${row.roles.join(",")}`));
		assert.equal(requests.length, 2);
		assert.deepEqual(requests[1]!.roles.slice(-2), ["assistant", "toolResult"], "after recovery the model sees the interrupted result");
	}
	try {
		process.kill(-childPid, "SIGKILL");
	} catch {}
	console.log("PASS: the tool was reported as interrupted with its partial output and was not rerun");
}

if (scenarioFilter !== "tool") await streamScenario();
if (scenarioFilter !== "stream") await toolScenario();
