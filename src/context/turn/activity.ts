import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionDescriptor } from "../../sessions/spec.js";
import { formatSessionId } from "../../sessions/identity.js";
import { clipOneLine } from "../../util/text.js";
import { appendAgentActivity } from "./state.js";

const ACTIVITY_EXCERPT_CHARS = 180;
const MAX_ACTIVITY_ENTRIES_PER_TURN = 8;
const PUBLICATION_TOOLS = new Set([
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
]);

export function recordSettledSessionActivity(input: {
  workspacePath: string;
  descriptor: SessionDescriptor;
  sessionInstanceId: string;
  messages: AgentMessage[];
}): void {
  if (input.descriptor.storage.kind !== "durable") return;
  const entries = describeSessionActivity(
    input.descriptor,
    input.messages,
    input.sessionInstanceId,
  );
  appendAgentActivity(
    input.workspacePath,
    input.descriptor.key.agentId,
    entries,
  );
}

export function describeSessionActivity(
  descriptor: SessionDescriptor,
  messages: AgentMessage[],
  sessionInstanceId = formatSessionId(descriptor.key),
): Array<{
  sessionId: string;
  sessionLabel: string;
  at: string;
  summary: string;
  inspect: string;
}> {
  const sessionLabel = formatSessionId(descriptor.key);
  const inspect = `shrimpy sessions list ${sessionLabel} --agent ${descriptor.key.agentId}`;
  const at = activityTimestamp(messages);
  const entries: Array<{
    sessionId: string;
    sessionLabel: string;
    at: string;
    summary: string;
    inspect: string;
  }> = [];
  const otherTools = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      const publication = describePublication(
        block.name,
        block.arguments,
        descriptor,
      );
      if (publication) {
        entries.push({
          sessionId: sessionInstanceId,
          sessionLabel,
          at,
          summary: publication,
          inspect,
        });
      } else {
        otherTools.add(block.name);
      }
    }
  }

  if (descriptor.delivery.kind === "transcript") {
    const response = lastAssistantText(messages);
    if (response) {
      entries.push({
        sessionId: sessionInstanceId,
        sessionLabel,
        at,
        summary: `said: “${clipOneLine(response, ACTIVITY_EXCERPT_CHARS)}”`,
        inspect,
      });
    }
  }

  if (otherTools.size > 0) {
    entries.push({
      sessionId: sessionInstanceId,
      sessionLabel,
      at,
      summary: `used tools: ${[...otherTools].sort().join(", ")}`,
      inspect,
    });
  }

  return entries.slice(0, MAX_ACTIVITY_ENTRIES_PER_TURN);
}

function describePublication(
  name: string,
  args: Record<string, unknown>,
  descriptor: SessionDescriptor,
): string | undefined {
  if (!PUBLICATION_TOOLS.has(name)) return undefined;

  if (name === "send_message") {
    const channel = stringArg(args.channel) ?? "(unknown channel)";
    const text = stringArg(args.text);
    return text
      ? `sent to ${channel}: “${clipOneLine(text, ACTIVITY_EXCERPT_CHARS)}”`
      : `sent a message to ${channel}`;
  }

  const channel = descriptor.delivery.kind === "channel"
    ? descriptor.delivery.channel
    : "(no active channel)";
  const text = name === "report"
    ? stringArg(args.summary)
    : stringArg(args.text);
  return text
    ? `published ${name} in ${channel}: “${clipOneLine(text, ACTIVITY_EXCERPT_CHARS)}”`
    : `published ${name} in ${channel}`;
}

function lastAssistantText(messages: AgentMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    const text = message.content
      .flatMap((block) => block.type === "text" ? [block.text] : [])
      .join("")
      .trim();
    if (text) return text;
  }
  return undefined;
}

function activityTimestamp(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const timestamp = messages[index]?.timestamp;
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }
  return new Date().toISOString();
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}
