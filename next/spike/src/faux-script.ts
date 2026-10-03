import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxThinking,
	fauxToolCall,
	type FauxProviderHandle,
	type FauxResponseFactory,
	type Message,
	type ToolResultMessage,
} from "@earendil-works/pi-ai";

const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `line ${String(i + 1).padStart(2, "0")}: the quick brown fox jumps over the lazy dog`).join("\n");

const SLOW_TOOL_COMMAND = [
	'echo "$$" > child.pid',
	'echo "attempt $(date +%s)" >> runs.log',
	"echo started",
	"sleep 8",
	'echo finished >> runs.log',
].join("; ");

const DEMO_TOOL_COMMAND = "printf 'listing the work directory\\n'; ls -1 | head -5; sleep 2; printf 'done\\n'";

function lastUserText(messages: readonly Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role !== "user") continue;
		return typeof message.content === "string"
			? message.content
			: message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
	}
	return "";
}

/** The newest tool result that follows the latest user message, if any. */
function pendingToolResult(messages: readonly Message[]): ToolResultMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role === "user") return undefined;
		if (message.role === "toolResult") return message;
	}
	return undefined;
}

function resultText(result: ToolResultMessage): string {
	return result.content.map((block) => (block.type === "text" ? block.text : "[image]")).join("");
}

type Script = (messages: readonly Message[]) => ReturnType<typeof fauxAssistantMessage>;

const SCRIPTS: Record<string, Script> = {
	/** One long streamed answer, for killing the host mid-stream. */
	stream: () => fauxAssistantMessage(LONG_TEXT),

	/** A slow shell call, then a final answer that quotes the tool result it was given. */
	tool: (messages) => {
		const result = pendingToolResult(messages);
		if (result === undefined) {
			return fauxAssistantMessage([fauxText("Running the slow command."), fauxToolCall("bash", { command: SLOW_TOOL_COMMAND }, { id: "call-slow" })], {
				stopReason: "toolUse",
			});
		}
		return fauxAssistantMessage(`The model saw the tool result (isError=${result.isError}): ${JSON.stringify(resultText(result).slice(0, 240))}`);
	},

	/** Thinking, streamed markdown, and a short shell call on request. Used by the terminal and browser views. */
	chat: (messages) => {
		const result = pendingToolResult(messages);
		const user = lastUserText(messages);
		if (result === undefined && /\b(tool|bash|ls|files?)\b/i.test(user)) {
			return fauxAssistantMessage(
				[fauxThinking("The user wants a listing, so I will run a short shell command."), fauxText("Let me look at the work directory."), fauxToolCall("bash", { command: DEMO_TOOL_COMMAND }, { id: `call-${Date.now()}` })],
				{ stopReason: "toolUse" },
			);
		}
		const lead = result === undefined ? `You said: **${user.trim().slice(0, 120)}**` : `The command finished (isError=${result.isError}).`;
		return fauxAssistantMessage([
			fauxThinking("Composing a short markdown reply with a list and a code block."),
			fauxText(
				`${lead}\n\n- first point, streamed token by token\n- second point with \`inline code\`\n- third point\n\n\`\`\`ts\nconst answer = 42;\nconsole.log(answer);\n\`\`\`\n\nThat is all for this turn.`,
			),
		]);
	},
};

export function scenarioNames(): string[] {
	return Object.keys(SCRIPTS);
}

/** A faux provider that answers from a stateless script and logs every request it receives. */
export function createScriptedFaux(home: string, scenario: string, tokensPerSecond: number): FauxProviderHandle {
	const script = SCRIPTS[scenario];
	if (script === undefined) throw new Error(`Unknown scenario ${scenario}; expected one of ${scenarioNames().join(", ")}`);
	const faux = fauxProvider({ tokensPerSecond, tokenSize: { min: 1, max: 2 } });
	const respond: FauxResponseFactory = (context) => {
		faux.appendResponses([respond]);
		const digest = createHash("sha1").update(JSON.stringify(context.messages)).digest("hex").slice(0, 12);
		appendFileSync(
			join(home, "requests.jsonl"),
			`${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), scenario, messages: context.messages.length, roles: context.messages.map((m) => m.role), digest })}\n`,
		);
		return script(context.messages);
	};
	faux.setResponses([respond]);
	return faux;
}
