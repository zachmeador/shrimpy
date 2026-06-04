const CONTEXT_OPEN_TAG = "<context>";
const CONTEXT_CLOSE_TAG = "</context>";

export function formatTurnContextEnvelope(text: string): string {
  return [
    CONTEXT_OPEN_TAG,
    text,
    CONTEXT_CLOSE_TAG,
    "",
    "The context above is background for the user message below. Answer the user message below using this context when relevant.",
  ].join("\n");
}

export function formatPromptWithTurnContext(
  prompt: string,
  turnContextText: string,
): string {
  return `${formatTurnContextEnvelope(turnContextText)}\n\n${prompt}`;
}

export function formatEphemeralTurnContext(text: string): string {
  return formatTurnContextEnvelope(text);
}
