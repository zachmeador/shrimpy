/**
 * The agent's durable extensions, which the host installs in the engine's
 * registry: what the model is told, as prompt sections made from the home's
 * files, and the tools it calls to send and read messages and to wake itself
 * later. They run inside the engine's work. The tools reach chat only over the
 * connection they are handed, so the extensions must not know how the agent is
 * reached, or how chat and the gateway are found.
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
export { type MessageToolsOptions, messageTools, type WakeupToolsOptions, wakeupTools } from "./tools/index.ts";
