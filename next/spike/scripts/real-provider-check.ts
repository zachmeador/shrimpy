#!/usr/bin/env node
/**
 * One real model through the durable host: three turns on a fresh home, with the HTTP request bodies logged.
 *
 *   SPIKE_LOCAL_URL=http://HOST:PORT/v1 SPIKE_LOCAL_MODEL=MODEL node scripts/real-provider-check.ts
 *
 * Checks the wire format pi-ai's openai-completions adapter produces for a Qwen-style reasoning server:
 * reasoning_content echoed on earlier assistant messages, the output-token field, and a real tool-call round trip.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SPIKE_LOCAL_URL === undefined) {
	console.error("Set SPIKE_LOCAL_URL (base URL including /v1) and SPIKE_LOCAL_MODEL.");
	process.exit(2);
}
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "spike-real-"));
const httpLog = join(home, "http.jsonl");
type Row = Record<string, any>;

const cliRun = (args: string[]): Promise<Row[]> =>
	new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args, "--home", home], { env: { ...process.env, SPIKE_LOG_HTTP: httpLog }, stdio: ["ignore", "pipe", "inherit"] });
		let out = "";
		child.stdout.on("data", (chunk) => (out += chunk));
		child.on("error", reject);
		child.on("exit", (code) => (code === 0 ? resolve(out.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))) : reject(new Error(`cli exited ${code}`))));
	});

const turn = async (text: string): Promise<{ seconds: number; answer: string }> => {
	const started = performance.now();
	const lines = await cliRun(["send", text]);
	const settled = lines.find((line) => line.event === "settled")!;
	assert.equal(settled.status, "done", JSON.stringify(settled));
	return { seconds: (performance.now() - started) / 1000, answer: settled.answer };
};
const wire = (): Row[] => readFileSync(httpLog, "utf8").trim().split("\n").map((row) => JSON.parse(row));

const one = await turn("Reply with exactly three words.");
console.log(`turn 1 (${one.seconds.toFixed(1)}s): ${JSON.stringify(one.answer)}`);
const two = await turn("And now one word only.");
console.log(`turn 2 (${two.seconds.toFixed(1)}s, a new process, history read back from SQLite): ${JSON.stringify(two.answer)}`);

const entries = (await cliRun(["log", "--json"])) as Row[];
const firstAnswer = entries.find((entry) => entry.kind === "pi.assistant")!.model[0];
const thinking = firstAnswer.content.find((block: Row) => block.type === "thinking");
console.log(`stored thinking block: signature ${JSON.stringify(thinking.thinkingSignature)}, ${thinking.thinking.length} chars`);

const [first, second] = wire();
const body1 = first!.body;
const body2 = second!.body;
console.log(`request 1 fields: ${Object.keys(body1).join(", ")}`);
console.log(`  max_completion_tokens ${body1.max_completion_tokens}, max_tokens ${body1.max_tokens}, store ${body1.store}, reasoning_effort ${body1.reasoning_effort}, tools ${body1.tools.map((tool: Row) => tool.function.name).join("/")}`);
console.log(`  roles ${body1.messages.map((m: Row) => m.role).join(",")}`);
const assistantInHistory = body2.messages.find((m: Row) => m.role === "assistant");
console.log(`request 2 history roles ${body2.messages.map((m: Row) => m.role).join(",")}; assistant message keys: ${Object.keys(assistantInHistory).join(", ")}`);
assert.equal(body1.max_tokens, undefined);
assert.ok(body1.max_completion_tokens >= 32768, "a generous output budget, since reasoning shares it");
assert.equal(body1.messages[0].role, "system", "no developer role");
assert.equal(assistantInHistory.reasoning_content, thinking.thinking, "the earlier reasoning is sent back as reasoning_content");
console.log("PASS: reasoning_content is echoed on earlier assistant messages, and the output budget is generous");

const three = await turn("Use the bash tool to run exactly this command: echo hello from the spike && uname -s   Then tell me what it printed.");
console.log(`turn 3 (${three.seconds.toFixed(1)}s): ${JSON.stringify(three.answer.slice(0, 160))}`);
const after = (await cliRun(["log", "--json"])) as Row[];
const toolResult = after.filter((entry) => entry.kind === "pi.tool-result").at(-1)!.model[0];
const toolText = toolResult.content.map((block: Row) => block.text).join("");
const call = after.filter((entry) => entry.kind === "pi.assistant").map((entry) => entry.model[0].content.find((block: Row) => block.type === "toolCall")).filter(Boolean).at(-1);
console.log(`tool call: ${JSON.stringify(call.arguments)} -> isError ${toolResult.isError}, output ${JSON.stringify(toolText)}`);
assert.equal(toolResult.isError, false);
assert.match(toolText, /hello from the spike/);
console.log("PASS: the model made a well-formed tool call, durable ran it, and the model read the result");
const usage = after.filter((entry) => entry.kind === "pi.assistant").map((entry) => entry.model[0].usage);
console.log(`usage per answer (input/output tokens): ${usage.map((u: Row) => `${u.input}/${u.output}`).join(", ")}`);
