const CONTEXT_OPEN_TAG = "<context>";
const CONTEXT_CLOSE_TAG = "</context>";

export function formatEphemeralTurnContext(text: string): string {
  return [
    CONTEXT_OPEN_TAG,
    text,
    CONTEXT_CLOSE_TAG,
    "",
    "Use this ephemeral context for the immediately following message. Do not answer the context itself.",
  ].join("\n");
}
