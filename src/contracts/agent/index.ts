/**
 * The agent API: what any client may ask of a running agent. A client reaches
 * an agent by its name through the gateway, and comes in with a ticket before
 * anything else, or by the agent's home path straight to its socket, which asks
 * for no ticket. It carries Shrimpy's own shapes and must not know the
 * engine's record types or any program's internals. This door is safe for
 * browsers; `node.ts` adds the parts that need Node.
 */
export {
  type AgentConnection,
  AgentConnectionLostError,
  connectAgent,
  type SessionHandle,
} from "./connect.ts";
export { AGENT_RUNTIME_DIR, type AgentEndpoint, endpointFile } from "./endpoint.ts";
export { AGENT_HOME_VARIABLE, type Membership, membershipFile } from "./membership.ts";
export { SessionDirectory, SessionService } from "./services.ts";
export type {
  Check,
  Member,
  Occurrence,
  OccurrenceEnding,
  QueuedInput,
  Reloaded,
  SessionActivity,
  SessionItem,
  SessionStatus,
  SessionSummary,
  SessionView,
  Settlement,
  ToolStatus,
  TriggerDetail,
  TriggerSchedule,
  TriggerSummary,
} from "./view.ts";
