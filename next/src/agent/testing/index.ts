/**
 * Test support for the agent: a scripted model and a stand-in OpenAI-compatible
 * server, both without a network, an agent wired to a stand-in chat with a
 * person to talk to it, and helpers to attach to an agent, stop it and read its
 * views. Only tests and test fixtures import this, and it must not know about
 * any other program.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Message,
  type Models,
  type ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { AgentOptions } from "../index.ts";

export { attachThread, closeAfter } from "./attach.ts";
export { type ChatRequest, stubChatCompletions } from "./chat-completions.ts";
export { startAgentChild } from "./child.ts";
export { scout, zach } from "./names.ts";
export { type AgentRig, type AgentRigOptions, startAgentRig } from "./rig.ts";
export { answered, assistantItems, toolItems } from "./views.ts";

/**
 * What the scripted model does. `chat`, `fail`, `stream` and `tool` each do one
 * thing. `mixed` picks one of them by what the latest message says: "stream"
 * streams a long answer, "refuse" fails, "slow command" runs the slow shell
 * call, and anything else is answered as `chat` answers. `gated` answers as
 * `chat` does once `releaseGate` has been called for its home, and `gatedFail`
 * fails as `fail` does once it has.
 */
export type FauxScenario = "chat" | "fail" | "stream" | "tool" | "mixed" | "gated" | "gatedFail";

/** What the model answers to the messages it is sent, so far. It may take its time. */
export type Script = (
  messages: readonly Message[],
  home: string,
) => ReturnType<typeof fauxAssistantMessage> | Promise<ReturnType<typeof fauxAssistantMessage>>;

const LONG_TEXT = Array.from(
  { length: 40 },
  (_, index) => `line ${String(index + 1).padStart(2, "0")}: the quick brown fox jumps over the lazy dog`,
).join("\n");

/** Records its own pid and each attempt, so a test can tell whether it ran twice. */
const SLOW_COMMAND = [
  'echo "$$" > child.pid',
  'echo "attempt" >> runs.log',
  "echo started",
  "sleep 4",
  "echo finished >> runs.log",
].join("; ");

const LISTING_COMMAND = "printf 'listing the work directory\\n'; sleep 1; printf 'done\\n'";

/** Let the answers of a `gated` model through. */
export function releaseGate(home: string): void {
  writeFileSync(join(home, "release"), "");
}

/**
 * Wait until `releaseGate` has been called for `home`. The home going away ends
 * the wait too, so a model nobody released does not outlive its test.
 */
export async function untilReleased(home: string): Promise<void> {
  while (existsSync(home) && !existsSync(join(home, "release"))) await delay(10);
}

const SCRIPTS: Record<FauxScenario, Script> = {
  /** One long streamed answer, for interrupting the agent mid-stream. */
  stream: () => fauxAssistantMessage(LONG_TEXT),

  /** A model that refuses every request, in a way the agent does not retry. */
  fail: () => fauxAssistantMessage([], { stopReason: "error", errorMessage: "The model refused the request." }),

  /** A slow shell call, then an answer that quotes the tool result it was given. */
  tool: (messages) => {
    const result = pendingToolResult(messages);
    if (result === undefined) {
      return fauxAssistantMessage(
        [
          fauxText("Running the slow command."),
          fauxToolCall("bash", { command: SLOW_COMMAND }, { id: "call-slow" }),
        ],
        { stopReason: "toolUse" },
      );
    }
    return fauxAssistantMessage(
      `The model saw the tool result (isError=${String(result.isError)}): ${resultText(result)}`,
    );
  },

  /** Thinking, a short shell call when asked about files, and a markdown answer. */
  chat: (messages) => {
    const result = pendingToolResult(messages);
    const user = lastUserText(messages);
    if (result === undefined && /\bfiles?\b/i.test(user)) {
      return fauxAssistantMessage(
        [
          fauxThinking("The user wants a listing, so I will run a short shell command."),
          fauxText("Let me look at the work directory."),
          fauxToolCall("bash", { command: LISTING_COMMAND }, { id: `call-${messages.length}` }),
        ],
        { stopReason: "toolUse" },
      );
    }
    const lead = result === undefined ? `You said: ${user.trim()}` : "The command finished.";
    return fauxAssistantMessage([
      fauxThinking("Composing a short reply."),
      fauxText(`${lead}\n\n- first point\n- second point\n\nThat is all for this turn.`),
    ]);
  },

  mixed: (messages, home) => {
    const user = lastUserText(messages);
    if (/\bstream\b/i.test(user)) return SCRIPTS.stream(messages, home);
    if (/\brefuse\b/i.test(user)) return SCRIPTS.fail(messages, home);
    if (/\bslow command\b/i.test(user)) return SCRIPTS.tool(messages, home);
    return SCRIPTS.chat(messages, home);
  },

  gated: async (messages, home) => {
    await untilReleased(home);
    return SCRIPTS.chat(messages, home);
  },

  gatedFail: async (messages, home) => {
    await untilReleased(home);
    return SCRIPTS.fail(messages, home);
  },
};

/**
 * A model runtime whose only model follows `scenario`, or `script` when given.
 * Each request is logged to `home/requests.jsonl`.
 */
export function fauxModels(options: {
  home: string;
  scenario?: FauxScenario;
  script?: Script;
  tokensPerSecond?: number;
  /** How many characters a streamed piece holds. Long answers need big pieces to arrive in a reasonable time. */
  tokenSize?: { min: number; max: number };
}): { models: Models; model: AgentOptions["model"] } {
  const script = options.script ?? SCRIPTS[options.scenario ?? "chat"];
  const faux = fauxProvider({
    tokensPerSecond: options.tokensPerSecond ?? 400,
    tokenSize: options.tokenSize ?? { min: 1, max: 2 },
  });
  mkdirSync(options.home, { recursive: true });
  const respond: FauxResponseFactory = (request) => {
    faux.appendResponses([respond]);
    const digest = createHash("sha1").update(JSON.stringify(request.messages)).digest("hex");
    appendFileSync(
      join(options.home, "requests.jsonl"),
      `${JSON.stringify({ pid: process.pid, roles: request.messages.map((m) => m.role), digest })}\n`,
    );
    return script(request.messages, options.home);
  };
  faux.setResponses([respond]);
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  return { models, model: { provider: model.provider, modelId: model.id } };
}

/** The requests `fauxModels` logged for `home`, oldest first. The digest identifies the messages sent. */
export function loggedRequests(home: string): { pid: number; digest: string }[] {
  return readFileSync(join(home, "requests.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { pid: number; digest: string });
}

function lastUserText(messages: readonly Message[]): string {
  for (const message of messages.toReversed()) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  }
  return "";
}

/** The newest tool result after the latest user message, if any. */
function pendingToolResult(messages: readonly Message[]): ToolResultMessage | undefined {
  for (const message of messages.toReversed()) {
    if (message.role === "user") return undefined;
    if (message.role === "toolResult") return message;
  }
  return undefined;
}

function resultText(result: ToolResultMessage): string {
  return result.content.map((block) => (block.type === "text" ? block.text : "[image]")).join("");
}
