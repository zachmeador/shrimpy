import { renderMemoryContext } from "../../memory/context.js";
import type { TurnContext } from "./types.js";

export function renderTurnContext(
  context: TurnContext,
  maxChars = context.maxChars,
): string {
  const lines = [
    "[turn-context]",
    `time: ${context.capturedAt}`,
    `agent: ${context.agentId}`,
    `session: ${context.sessionType}${context.channel ? ` channel: ${context.channel}` : ""}`,
  ];

  if (context.items.length === 0) {
    lines.push("- no turn-context items");
  } else {
    for (const item of context.items) {
      lines.push(`- ${item.summary}`);
      if (item.inspect) lines.push(`  inspect: ${item.inspect}`);
    }
  }

  if (context.memory) {
    const memoryBlock = renderMemoryContext(context.memory);
    if (memoryBlock) lines.push("", memoryBlock);
  }

  return clipContextWithMarker(lines.join("\n"), maxChars);
}

export function clipContextWithMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[turn-context truncated]`;
}
