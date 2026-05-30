import { renderMemoryBriefing } from "../../memory/briefing.js";
import type { TurnContext } from "./types.js";

export function renderTurnContext(
  briefing: TurnContext,
  maxChars = briefing.maxChars,
): string {
  const lines = [
    "[briefing]",
    `time: ${briefing.capturedAt}`,
    `agent: ${briefing.agentId}`,
    `session: ${briefing.sessionType}${briefing.channel ? ` channel: ${briefing.channel}` : ""}`,
  ];

  if (briefing.items.length === 0) {
    lines.push("- no briefing items");
  } else {
    for (const item of briefing.items) {
      lines.push(`- ${item.summary}`);
      if (item.inspect) lines.push(`  inspect: ${item.inspect}`);
    }
  }

  if (briefing.memory) {
    const memoryBlock = renderMemoryBriefing(briefing.memory);
    if (memoryBlock) lines.push("", memoryBlock);
  }

  return clipBriefingWithMarker(lines.join("\n"), maxChars);
}

export function clipBriefingWithMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 28)).trimEnd()}\n[briefing truncated]`;
}
