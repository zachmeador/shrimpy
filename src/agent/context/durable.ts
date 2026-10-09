/**
 * The home-context extension: it gives every session the same instructions as
 * prompt sections in a fixed order. The files are read when the agent starts and
 * again when it finds them changed, and sections render only from what was read. It
 * must not depend on the agent's own tools or on how the agent is reached.
 */
export { type HomeContext, homeContext } from "./home-context.durable.ts";
