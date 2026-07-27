import type { Api, Model } from "@earendil-works/pi-ai";
import type { ChannelBus } from "../channels/bus.js";
import type { ChannelMessage } from "../channels/protocol.js";
import { formatChannelMessage } from "../context/turn/channel-message.js";
import {
  channelReplyRecoveryPrompt,
  channelReplyReviewPrompt,
  channelReplyReviewSystem,
} from "../instructions/index.js";
import {
  runQuickCall,
  type QuickCallRuntime,
} from "../inference/quick-call.js";
import type { SessionTurnResult } from "./turn-output.js";

export type ChannelReplyReviewResult =
  | { kind: "skipped" }
  | { kind: "reviewed" }
  | { kind: "wake"; prompt: string };

export interface ChannelReplyWatchdogInput {
  runtime: QuickCallRuntime;
  model: Model<Api>;
  channelBus: ChannelBus;
  channel: string;
  agentId: string;
  message: ChannelMessage;
  turn: SessionTurnResult;
  signal?: AbortSignal;
}

interface ChannelReplyWatchdogDeps {
  quickCall?: typeof runQuickCall;
}

const MAX_RECENT_HUMAN_MESSAGES = 3;
const MAX_HUMAN_CONTEXT_CHARS = 2_400;
const MAX_ASSISTANT_TAIL_CHARS = 2_000;
const MAX_REMINDER_CHARS = 500;

export async function reviewChannelReply(
  input: ChannelReplyWatchdogInput,
  deps: ChannelReplyWatchdogDeps = {},
): Promise<ChannelReplyReviewResult> {
  if (input.message.sender.kind !== "human") return { kind: "skipped" };

  const { messages } = input.channelBus.read(input.channel);
  const sourceIndex = findLastMessageIndex(messages, input.message.id);
  if (sourceIndex < 0) return { kind: "skipped" };
  if (hasVisibleAgentMessageAfter(messages, sourceIndex, input.agentId)) {
    return { kind: "skipped" };
  }

  const recentHumanMessages = clipStart(
    messages
      .slice(0, sourceIndex + 1)
      .filter((message) => message.sender.kind === "human")
      .slice(-MAX_RECENT_HUMAN_MESSAGES)
      .map((message) => formatChannelMessage(input.channel, message))
      .join("\n\n"),
    MAX_HUMAN_CONTEXT_CHARS,
  );
  const privateAssistantTail = clipStart(
    input.turn.assistantText.trim() || "(no private assistant text was emitted)",
    MAX_ASSISTANT_TAIL_CHARS,
  );
  const result = await (deps.quickCall ?? runQuickCall)({
    runtime: input.runtime,
    model: input.model,
    systemPrompt: channelReplyReviewSystem.render(),
    prompt: channelReplyReviewPrompt.render({
      recentHumanMessages,
      privateAssistantTail,
    }),
    signal: input.signal,
  });
  const decision = parseReviewDecision(result.text);
  if (decision.kind === "reviewed") return decision;
  return {
    kind: "wake",
    prompt: channelReplyRecoveryPrompt.render({
      reminder: clipEnd(decision.reminder, MAX_REMINDER_CHARS),
    }),
  };
}

export function parseReviewDecision(
  output: string,
): { kind: "reviewed" } | { kind: "wake"; reminder: string } {
  const trimmed = output.trim();
  if (trimmed === "NO_WAKE") return { kind: "reviewed" };

  const [firstLine, ...remaining] = trimmed.split(/\r?\n/);
  const reminder = remaining.join("\n").trim();
  if (firstLine === "WAKE" && reminder) {
    return { kind: "wake", reminder };
  }
  throw new Error("channel reply review returned an invalid decision");
}

function findLastMessageIndex(
  messages: ChannelMessage[],
  messageId: string,
): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.id === messageId) return index;
  }
  return -1;
}

function hasVisibleAgentMessageAfter(
  messages: ChannelMessage[],
  sourceIndex: number,
  agentId: string,
): boolean {
  const actorId = `agent:${agentId}`;
  return messages.slice(sourceIndex + 1).some((message) =>
    message.sender.kind === "agent"
    && message.sender.actorId === actorId
    && message.content.type === "text"
  );
}

function clipStart(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `[truncated]\n${text.slice(-maxChars)}`;
}

function clipEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated]`;
}
