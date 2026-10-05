/**
 * What a home would tell an agent, read from its files and rendered as the prompt
 * sections every session gets: what every agent is told about Shrimpy, the agent's
 * `SOUL.md`, the home's context files and the skills it is shown, its own and
 * those that ship with Shrimpy. This door previews that with no engine and no
 * running agent, and the extension that gives it to every session is behind
 * `durable.ts`. It names the agent's own tools in its instructions but must not
 * depend on them, or on how the agent is reached, or know what a message looks
 * like.
 */
export type { AgentFacts } from "./base.ts";
export { type ContextPreview, type ContextReport, previewContext } from "./preview.ts";
export type { RenderedSection } from "./sections.ts";
