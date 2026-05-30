const CONTEXT_OPEN_TAG = "<context>";
const CONTEXT_CLOSE_TAG = "</context>";

export function composePromptWithBriefing(
  body: string,
  briefingText?: string,
): string {
  const briefing = briefingText?.trim();
  return briefing
    ? `${CONTEXT_OPEN_TAG}\n${briefing}\n${CONTEXT_CLOSE_TAG}\n\n${body}`
    : body;
}

/**
 * Pi only recognizes slash commands when the raw prompt starts with `/`.
 * Leave those inputs untouched so extension commands and built-ins still route
 * through Pi's command path.
 */
export function isPromptAlreadyPrepared(body: string): boolean {
  return body.startsWith(CONTEXT_OPEN_TAG) || body.startsWith("/");
}

export function stripPromptBriefingForDisplay(text: string): string {
  if (!text.startsWith(CONTEXT_OPEN_TAG)) return text;

  const closeIndex = text.indexOf(CONTEXT_CLOSE_TAG);
  if (closeIndex === -1) return text;

  const afterClose = text.slice(closeIndex + CONTEXT_CLOSE_TAG.length);
  return afterClose.replace(/^(?:\r?\n){1,2}/, "");
}
