import {
  channelTurnDelivery,
  turnContextLeading,
  turnContextTrailing,
} from "../../instructions/index.js";

export const TURN_CONTEXT_INSTRUCTION = turnContextLeading.render();

export const TRAILING_TURN_CONTEXT_INSTRUCTION = turnContextTrailing.render();

export function formatTurnContextPrefix(
  text: string,
  opts?: { channelDelivery?: boolean },
): string {
  return [
    text.trimEnd(),
    "",
    ...(opts?.channelDelivery
      ? [channelTurnDelivery.render(), ""]
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

export function formatTrailingTurnContext(text: string): string {
  return [
    text.trimEnd(),
    "",
    TRAILING_TURN_CONTEXT_INSTRUCTION,
  ].join("\n");
}

export function stripTurnContextPrefixForDisplay(text: string): string {
  const instructionIndex = text.indexOf(TURN_CONTEXT_INSTRUCTION);
  if (instructionIndex < 0) return text;
  return text
    .slice(instructionIndex + TURN_CONTEXT_INSTRUCTION.length)
    .replace(/^\s+/, "");
}
