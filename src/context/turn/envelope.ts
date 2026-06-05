export const CONTEXT_OPEN_TAG = "<context>";
export const CONTEXT_CLOSE_TAG = "</context>";
export const TURN_CONTEXT_INSTRUCTION =
  "The context above is background for the user message below. Answer the user message below using this context when relevant.";

export function formatTurnContextEnvelope(text: string): string {
  return [
    CONTEXT_OPEN_TAG,
    text,
    CONTEXT_CLOSE_TAG,
    "",
    TURN_CONTEXT_INSTRUCTION,
  ].join("\n");
}

export function formatPromptWithTurnContext(
  prompt: string,
  turnContextText: string,
): string {
  return `${formatTurnContextEnvelope(turnContextText)}\n\n${prompt}`;
}

export function stripPromptTurnContextForDisplay(text: string): string {
  if (!text.startsWith(CONTEXT_OPEN_TAG)) return text;

  const closeIndex = text.indexOf(CONTEXT_CLOSE_TAG, CONTEXT_OPEN_TAG.length);
  if (closeIndex < 0) return text;

  let promptText = text.slice(closeIndex + CONTEXT_CLOSE_TAG.length);
  promptText = promptText.replace(/^\s+/, "");
  if (promptText.startsWith(TURN_CONTEXT_INSTRUCTION)) {
    promptText = promptText
      .slice(TURN_CONTEXT_INSTRUCTION.length)
      .replace(/^\s+/, "");
  }
  return promptText;
}

export function formatEphemeralTurnContext(text: string): string {
  return formatTurnContextEnvelope(text);
}
