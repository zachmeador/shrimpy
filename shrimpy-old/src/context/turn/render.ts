import type { TurnContext } from "./types.js";

export function renderTurnContext(
  context: TurnContext,
  maxChars = context.maxChars,
): string {
  return renderTurnContextResult(context, maxChars).text;
}

export function renderTurnContextResult(
  context: TurnContext,
  maxChars = context.maxChars,
): {
  text: string;
  deliveredItemIds: string[];
} {
  const lines = [
    "[turn-context]",
    `time: ${context.capturedAt}`,
    `agent: ${context.agentId}`,
    `session: ${context.sessionType}${context.channel ? ` channel: ${context.channel}` : ""}`,
  ];

  if (context.items.length === 0) {
    lines.push("- no turn-context items");
    return {
      text: clipContextWithMarker(lines.join("\n"), maxChars),
      deliveredItemIds: [],
    };
  }

  const blocks = context.items.map((item) => ({
    id: item.id,
    text: [
      `- ${item.summary}`,
      ...(item.inspect ? [`  inspect: ${item.inspect}`] : []),
    ].join("\n"),
  }));
  const fullText = [...lines, ...blocks.map((block) => block.text)].join("\n");
  if (fullText.length <= maxChars) {
    return {
      text: fullText,
      deliveredItemIds: blocks.map((block) => block.id),
    };
  }

  const deliveredItemIds: string[] = [];
  const fitted = [...lines];
  for (const block of blocks) {
    const candidate = [...fitted, block.text, "[turn-context truncated]"].join("\n");
    if (candidate.length > maxChars) break;
    fitted.push(block.text);
    deliveredItemIds.push(block.id);
  }
  fitted.push("[turn-context truncated]");
  return {
    text: clipContextWithMarker(fitted.join("\n"), maxChars),
    deliveredItemIds,
  };
}

export function clipContextWithMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[turn-context truncated]`;
}
