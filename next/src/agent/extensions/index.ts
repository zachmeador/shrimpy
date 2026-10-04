/**
 * The agent's durable extensions, which the host installs in the engine's
 * registry: what the model is told, as prompt sections made from the home's
 * files, and the tools it calls to send and read messages. They run inside the
 * engine's work, so they reach the rest of the agent only through what they
 * are handed, and they must not know how the agent is reached, or how chat and
 * the gateway are found.
 */
export {
  type AgentFacts,
  type ContextPreview,
  type ContextReport,
  type HomeContext,
  homeContext,
  previewContext,
  type RenderedSection,
} from "./context/index.ts";
export { type MessageToolsOptions, messageTools } from "./tools/index.ts";
