/**
 * The agent's contract: what any client may ask of a running agent, as Chord
 * objects at `agent({ name })`. `Agent` is the agent as a whole, with its
 * sessions and its triggers; `Session` is one session, a window over its
 * history and control over its work; `AgentPresence` is the agent being there,
 * which the gateway holds. Every reference is live, so a client follows by
 * holding, and nothing polls. A client reaches an agent by its name through the
 * gateway, stamped with who it is, or by the agent's home path on the home's own
 * socket, where it is `home`. It carries Shrimpy's own shapes, which the agent
 * builds, and must not know the engine's record types or any program's
 * internals. The one sentence for each reason a turn ends without an answer is
 * here too, so that the agent's receipts and every client say it the same way.
 * This door is safe for browsers; `node.ts` adds the parts that need Node.
 */
export { Agent } from "./agent.ts";
export { AGENT_RUNTIME_DIR, type AgentEndpoint, endpointFile } from "./endpoint.ts";
export { failureWords } from "./failures.ts";
export { AGENT_HOME_VARIABLE, type Membership, membershipFile } from "./membership.ts";
export { AgentPresence } from "./presence.ts";
export { MAX_READ, Session } from "./session.ts";
export {
  type AgentModel,
  AgentModelSchema,
  type AgentModels,
  AgentModelsSchema,
  type Check,
  CheckSchema,
  type ModelId,
  ModelIdSchema,
  type Occurrence,
  type OccurrenceEnding,
  OccurrenceEndingSchema,
  OccurrenceSchema,
  type QueuedInput,
  QueuedInputSchema,
  type Reloaded,
  ReloadedSchema,
  type SessionActivity,
  SessionActivitySchema,
  type SessionImage,
  SessionImageSchema,
  type SessionItem,
  SessionItemSchema,
  type SessionPage,
  SessionPageSchema,
  type SessionPlace,
  SessionPlaceSchema,
  type SessionStatus,
  SessionStatusSchema,
  type SessionSummary,
  SessionSummarySchema,
  type Settlement,
  SettlementSchema,
  type Submitted,
  SubmittedSchema,
  type ThreadPlace,
  ThreadPlaceSchema,
  type ToolStatus,
  ToolStatusSchema,
  type TriggerDetail,
  TriggerDetailSchema,
  type TriggerSchedule,
  TriggerScheduleSchema,
  type TriggerSummary,
  TriggerSummarySchema,
  type TurnFailure,
  TurnFailureSchema,
  type WaitingWakeup,
  WaitingWakeupSchema,
} from "./shapes.ts";
