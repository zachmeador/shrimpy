/**
 * The agent's contract: what any client may ask of a running agent, as Chord
 * objects at `agent({ name })`. `Agent` is the agent as a whole, with its
 * sessions and its triggers; `Session` is one session, a window over its
 * history and control over its work; `AgentPresence` is the agent being there,
 * which the gateway holds. Every reference is live, so a client follows by
 * holding, and nothing polls. A client reaches an agent by its name through the
 * gateway, stamped with who it is, or by the agent's home path on the home's own
 * socket, where it is `home`. It carries Shrimpy's own shapes and values, which
 * the agent builds, and must not know the engine's record types, its codes or
 * any program's internals. The one sentence for each reason a turn ends without
 * an answer is here too, so that the agent's receipts and every client say it
 * the same way. It also has the parts of a home's files that the agent and the
 * `shrimpy` command share and that open no file: the rule for an agent's name,
 * how a model is written, what wakes the agent in a room, how a trigger's
 * schedule and a delay are written, and the front matter a home's Markdown
 * files start with.
 * This door is safe for browsers; `node.ts` adds the parts that need Node.
 */
export { Agent } from "./agent.ts";
export { checkAgentName, type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export { AGENT_RUNTIME_DIR, type AgentEndpoint, endpointFile } from "./endpoint.ts";
export { failureWords } from "./failures.ts";
export { frontmatter, oneLine } from "./frontmatter.ts";
export { AGENT_HOME_VARIABLE, type Membership, membershipFile } from "./membership.ts";
export { AgentPresence } from "./presence.ts";
export { delayMs, delayText, describeSchedule, normalizeDelay, sameSchedule } from "./schedule.ts";
export { MAX_READ, Session } from "./session.ts";
export {
  DEFAULT_WAKE_POLICY,
  isWakePolicy,
  parseWake,
  WAKE_POLICIES,
  type WakePolicy,
  type WakeSettings,
} from "./wake.ts";
export {
  type AgentModel,
  AgentModelSchema,
  type AgentModels,
  AgentModelsSchema,
  type AnswerEnding,
  type Check,
  CheckSchema,
  type FailureReason,
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
