export function composePromptWithBriefing(
  body: string,
  briefingText?: string,
): string {
  const briefing = briefingText?.trim();
  return briefing ? `<context>\n${briefing}\n</context>\n\n${body}` : body;
}

/**
 * Pi only recognizes slash commands when the raw prompt starts with `/`.
 * Leave those inputs untouched so extension commands and built-ins still route
 * through Pi's command path.
 */
export function isPromptAlreadyPrepared(body: string): boolean {
  return body.startsWith("<context>") || body.startsWith("/");
}
