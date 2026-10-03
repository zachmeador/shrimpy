/**
 * Test support for the agent: a scripted model that needs no network and
 * answers the same way every time. Only tests and test fixtures import this.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
import type { ModelRef } from "@earendil-works/pi-durable";

export { type ChatRequest, stubChatCompletions } from "./chat-completions.ts";
export { answered, assistantItems, toolItems, waitForView } from "./wait.ts";

export type FauxScenario = "chat" | "stream" | "tool";

type Script = (messages: readonly Message[]) => ReturnType<typeof fauxAssistantMessage>;

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

const SCRIPTS: Record<FauxScenario, Script> = {
  /** One long streamed answer, for interrupting the agent mid-stream. */
  stream: () => fauxAssistantMessage(LONG_TEXT),

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
};

/** A model runtime whose only model follows `scenario`. Each request is logged to `home/requests.jsonl`. */
export function fauxModels(options: {
  home: string;
  scenario: FauxScenario;
  tokensPerSecond?: number;
}): { models: Models; model: ModelRef } {
  const script = SCRIPTS[options.scenario];
  const faux = fauxProvider({
    tokensPerSecond: options.tokensPerSecond ?? 400,
    tokenSize: { min: 1, max: 2 },
  });
  mkdirSync(options.home, { recursive: true });
  const respond: FauxResponseFactory = (request) => {
    faux.appendResponses([respond]);
    const digest = createHash("sha1").update(JSON.stringify(request.messages)).digest("hex");
    appendFileSync(
      join(options.home, "requests.jsonl"),
      `${JSON.stringify({ pid: process.pid, roles: request.messages.map((m) => m.role), digest })}\n`,
    );
    return script(request.messages);
  };
  faux.setResponses([respond]);
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  return { models, model: { provider: model.provider, modelId: model.id } };
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
