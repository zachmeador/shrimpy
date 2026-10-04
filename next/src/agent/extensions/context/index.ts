/**
 * The home-context extension: it gives every session the same instructions as
 * prompt sections in a fixed order, which are what every agent is told about
 * Shrimpy, the agent's `SOUL.md`, the home's context files and the skills it is
 * shown, its own and those that ship with Shrimpy. The files are read when the
 * agent starts and when it is asked to reload, and sections render only from
 * what was read. It names the message tools in its instructions but must not
 * depend on them, or on how the agent is reached, or know what a message looks
 * like.
 */
export type { AgentFacts } from "./base.ts";
export {
  type ContextPreview,
  type ContextReport,
  type HomeContext,
  homeContext,
  previewContext,
} from "./home-context.ts";
export type { RenderedSection } from "./sections.ts";
