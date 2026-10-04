/**
 * The agent API: what any client may ask of a running agent. It carries
 * Shrimpy's own shapes and must not know the engine's record types or any
 * program's internals. This door is safe for browsers; `node.ts` adds the
 * parts that need Node.
 */
export {
  type AgentConnection,
  AgentConnectionLostError,
  connectAgent,
  type SessionHandle,
} from "./connect.ts";
export { AGENT_RUNTIME_DIR, type AgentEndpoint, endpointFile } from "./endpoint.ts";
export { SessionDirectory, SessionService } from "./services.ts";
export type {
  QueuedInput,
  Reloaded,
  SessionActivity,
  SessionItem,
  SessionStatus,
  SessionSummary,
  SessionView,
  Settlement,
  ToolStatus,
} from "./view.ts";
