#!/usr/bin/env node
/**
 * Replay a pty-drive.py capture into a terminal emulator and print what the screen showed.
 *
 *   node scripts/render-capture.ts capture.json --at 1.5,4,9   screens at those seconds, then the final one
 *   node scripts/render-capture.ts capture.json --events        only the moments the screen text changed, as a timeline
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { Terminal } = createRequire(import.meta.url)("@xterm/headless") as typeof import("@xterm/headless");

const file = process.argv[2]!;
const at = (process.argv.includes("--at") ? process.argv[process.argv.indexOf("--at") + 1]!.split(",").map(Number) : []).sort((a, b) => a - b);
const capture = JSON.parse(readFileSync(file, "utf8")) as {
	cols: number;
	rows: number;
	cmd: string[];
	steps: { t: number; text: string }[];
	exit: number | string | null;
	chunks: { t: number; data: string }[];
};

const term = new Terminal({ cols: capture.cols, rows: capture.rows, scrollback: 2000, allowProposedApi: true });
const write = (data: Uint8Array) => new Promise<void>((resolve) => term.write(data, resolve));

/** Scrollback plus the viewport, trailing blanks trimmed. */
function screen(): string {
	const buffer = term.buffer.active;
	const lines: string[] = [];
	for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const kind = buffer.type === "alternate" ? "alternate screen" : "main screen";
	return `${lines.join("\n")}\n[${kind}, ${lines.length} lines]`;
}

const show = (label: string) => console.log(`\n----- ${label} -----\n${screen()}`);

console.log(`# ${capture.cmd.slice(-3).join(" ")}  (${capture.cols}x${capture.rows}, exit ${capture.exit})`);
console.log(`# typed: ${capture.steps.map((s) => `${s.t}s ${JSON.stringify(s.text)}`).join(", ")}`);
let next = 0;
for (const chunk of capture.chunks) {
	while (next < at.length && at[next]! < chunk.t) show(`screen at ${at[next++]}s`);
	await write(Buffer.from(chunk.data, "base64"));
}
while (next < at.length) show(`screen at ${at[next++]}s`);
show("final screen");
