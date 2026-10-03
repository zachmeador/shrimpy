#!/usr/bin/env node
/**
 * What does a second process on a live home do to its owner?
 *
 *   node scripts/second-opener.ts [--second-owner] [--no-lock]
 *
 * The owner streams a ~9 second answer. Three seconds in, a second process touches the home: `cli.ts inspect` (opens the
 * Harness without resuming), or with --second-owner another `cli.ts serve`. Around it, this script reads the `tasks` table
 * with a read-only SQLite connection, which opens no Harness and reconciles nothing.
 * --no-lock turns the owner lock off (SPIKE_NO_LOCK=1), to show the hazard it prevents.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const secondOwner = process.argv.includes("--second-owner");
const noLock = process.argv.includes("--no-lock");
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const headless = fileURLToPath(new URL("./headless-client.ts", import.meta.url));
const home = mkdtempSync(join(tmpdir(), "spike-opener-"));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const env = { ...process.env, SPIKE_SCENARIO: "stream", SPIKE_TPS: "60", ...(noLock ? { SPIKE_NO_LOCK: "1" } : {}) };
console.log(`owner lock: ${noLock ? "OFF" : "on"}; second process: ${secondOwner ? "another `serve`" : "`inspect`"}`);

const owner = spawn(process.execPath, [cli, "serve", "--home", home], { env, stdio: ["ignore", "pipe", "pipe"] });
let ownerErrors = "";
owner.stderr.on("data", (chunk) => (ownerErrors += chunk));
await new Promise<void>((resolve) => owner.stdout.on("data", (chunk) => String(chunk).includes('"listening"') && resolve()));
const client = spawn(process.execPath, [headless, "--home", home, "--send", "stream a long answer", "--quiet"], { env, stdio: ["ignore", "pipe", "inherit"] });
const clientDone = new Promise<string>((resolve) => {
	let out = "";
	client.stdout.on("data", (chunk) => (out += chunk));
	client.on("exit", () => resolve(out));
});
await sleep(3000);

const db = new DatabaseSync(join(home, "state", "agent.sqlite"), { readOnly: true });
const live = () => (db.prepare("SELECT id, kind, status FROM tasks WHERE status <> 'terminal' ORDER BY id").all() as { id: number; kind: string; status: string }[]).map((row) => `${JSON.parse(row.kind)}#${row.id}:${row.status}`);
const requests = () => (existsSync(join(home, "requests.jsonl")) ? readFileSync(join(home, "requests.jsonl"), "utf8").trim().split("\n").length : 0);

const before = live();
console.log(`3 s into the owner's turn, tasks table (raw read-only SQL): ${JSON.stringify(before)}; provider requests so far: ${requests()}`);
const second = spawn(process.execPath, [cli, secondOwner ? "serve" : "inspect", "--home", home], { env, stdio: ["ignore", "ignore", "pipe"] });
let secondError = "";
second.stderr.on("data", (chunk) => (secondError += chunk));
const exited = new Promise<number | null>((resolve) => second.on("exit", (code) => resolve(code)));
const code = await Promise.race([exited, sleep(5000).then(() => "still running" as const)]);
if (code === "still running") second.kill("SIGKILL");
await sleep(300);
const after = live();
const firstError = secondError.split("\n").find((line) => line.trim() !== "");
console.log(`the second process ${code === "still running" ? "was still running after 5 s and was killed" : `exited with code ${code}`}${firstError ? `: ${firstError.trim().slice(0, 170)}` : ""}`);
console.log(`tasks table now: ${JSON.stringify(after)}; provider requests so far: ${requests()}`);
db.close();

const output = await Promise.race([clientDone, sleep(25_000).then(() => undefined)]);
console.log(output === undefined ? "client: still waiting for the answer 25 s later (the answer needs ~9 s)" : `client saw: ${output.trim().split("\n").at(-2)}`);
const poisoned = ownerErrors.split("\n").find((line) => line.includes("poisoned"));
const cause = ownerErrors.split("\n").find((line) => line.includes("already belongs to"));
console.log(`the first owner reported: ${poisoned ? poisoned.replace("[harness report] ", "").trim() : "nothing"}${cause ? ` (cause: ${cause.replace("[cause]: ", "").trim()})` : ""}`);
client.kill("SIGKILL");
owner.kill("SIGKILL");
await new Promise((resolve) => owner.on("exit", resolve));
const total = requests();
console.log(`provider requests received in total: ${total}`);

assert.match(before.join(), /running/, "the owner's task was running before the second process");
if (!noLock) {
	assert.ok(typeof code === "number" && code !== 0, "the second process was refused");
	assert.match(secondError, /Another process owns this home/);
	assert.match(after.join(), /running/, "the owner's task row was left alone");
	assert.equal(total, 1);
	assert.ok(output !== undefined && !poisoned, "the owner finished its turn");
	console.log("RESULT: the second process was refused before it touched storage; the owner finished normally");
} else if (secondOwner) {
	assert.equal(total, 2, "the second owner resumed the generation and sent the request again");
	assert.ok(poisoned, "the first owner's session was poisoned");
	console.log("RESULT: a second owner reset the live owner's task, resumed it, sent the model request a second time, and left the first owner unable to commit");
} else {
	assert.doesNotMatch(after.join(), /running/, "the second open changed the owner's running task");
	assert.equal(total, 1);
	assert.ok(!poisoned, "the owner stayed healthy");
	console.log("RESULT: opening the Harness from a second process rewrote the live owner's task from running to pending");
}
