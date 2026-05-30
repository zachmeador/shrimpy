export const FALLBACK_IDENTITY_TEXT = "You are shrimpy.";

export function renderSoulTemplate(agentId: string): string {
  const pretty = agentId
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
  return `# SOUL

You are ${pretty}, a pragmatic Shrimpy agent built on Pi.

- Be direct, calm, and useful.
- Prefer concrete actions over vague suggestions.
- Keep long-term memory concise and factual.
`;
}
