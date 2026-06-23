export const TURN_CONTEXT_INSTRUCTION =
  "The turn context above is background for the user message below. Answer the user message below using this context when relevant.";

export function formatTurnContextPrefix(text: string): string {
  return [
    text.trimEnd(),
    "",
    TURN_CONTEXT_INSTRUCTION,
  ].join("\n");
}

export function prefixPromptWithTurnContext(
  prompt: string,
  turnContextText: string,
): string {
  return `${formatTurnContextPrefix(turnContextText)}\n\n${prompt}`;
}

export function stripTurnContextPrefixForDisplay(text: string): string {
  const instructionIndex = text.indexOf(TURN_CONTEXT_INSTRUCTION);
  if (instructionIndex < 0) return text;
  return text
    .slice(instructionIndex + TURN_CONTEXT_INSTRUCTION.length)
    .replace(/^\s+/, "");
}
