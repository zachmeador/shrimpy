import { GATEWAY_TURN_DELIVERY_INSTRUCTION } from "../system/tools.js";

export const TURN_CONTEXT_INSTRUCTION =
  "The turn context above is background for the user message below. Answer the user message below using this context when relevant.";

export function formatTurnContextPrefix(
  text: string,
  opts?: { channelDelivery?: boolean },
): string {
  return [
    text.trimEnd(),
    "",
    ...(opts?.channelDelivery
      ? [GATEWAY_TURN_DELIVERY_INSTRUCTION, ""]
      : []),
    TURN_CONTEXT_INSTRUCTION,
  ].join("\n");
}

export function prefixPromptWithTurnContext(
  prompt: string,
  turnContextText: string,
  opts?: { channelDelivery?: boolean },
): string {
  return `${formatTurnContextPrefix(turnContextText, opts)}\n\n${prompt}`;
}

export function stripTurnContextPrefixForDisplay(text: string): string {
  const instructionIndex = text.indexOf(TURN_CONTEXT_INSTRUCTION);
  if (instructionIndex < 0) return text;
  return text
    .slice(instructionIndex + TURN_CONTEXT_INSTRUCTION.length)
    .replace(/^\s+/, "");
}
