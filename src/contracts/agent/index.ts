/**
 * The agent's contract: what any client may ask of a running agent, as Chord
 * objects at `agent({ id })`. `Agent` is the agent as a whole, with its
 * sessions, its triggers, how it looks and its home's files to look at;
 * `Session` is one session, a window over its
 * history and control over its work; `AgentPresence` is the agent being there,
 * which the gateway holds. Every reference is live, so a client follows by
 * holding, and nothing polls. A client reaches an agent by its member ID
 * through the gateway, stamped with who it is, or by the agent's home path on
 * the home's own socket (at `HOME_AGENT`), where it is `home`. It carries Shrimpy's own shapes and values, which
 * the agent builds, and must not know the engine's record types, its codes or
 * any program's internals. The one sentence for each reason a turn ends without
 * an answer is here too, so that the agent's receipts and every client say it
 * the same way, and so are the words for what a session is doing, where it is
 * and how what is in it stands, which every client says the same way, the
 * words for a trigger, which the `triggers` command and a page say the same
 * way, and what to do when the gateway doesn't know a home's token, which the agent and
 * a command in its shell both say. It also has the parts of a home's files that
 * the agent and the `shrimpy` command share and that open no file: the rule for an agent's name, how a model is
 * written, what wakes the agent in a room, how a trigger's schedule and a delay
 * are written, and the front matter a home's Markdown files start with. And it
 * makes an agent's sigil and picks its pigment from the random numbers it is
 * handed, which `shrimpy agent init` does for a new home and a client does from
 * a member's ID for an agent whose home says nothing of them.
 * This door is safe for browsers; `node.ts` adds the parts that need Node.
 */
export { Agent, MAX_IMAGE_BYTES, MAX_TEXT_BYTES } from "./agent.ts";
export { checkAgentName, parseModelChoice, sameModel } from "./agent-config.ts";
export { AGENT_RUNTIME_DIR, type AgentEndpoint, endpointFile, HOME_AGENT } from "./endpoint.ts";
export { failureWords } from "./failures.ts";
export { frontmatter, NO_FRONTMATTER } from "./frontmatter.ts";
export { AGENT_HOME_VARIABLE, type JoiningMembership, type Membership, membershipFile, unknownTokenAdvice } from "./membership.ts";
export { AgentPresence } from "./presence.ts";
export { delayMs, delayText, describeSchedule, normalizeDelay, sameSchedule } from "./schedule.ts";
export { MAX_READ, Session } from "./session.ts";
export { lookFromId, makeSigil, parseSigil, pickPigment, type Pigment, PIGMENTS } from "./sigil.ts";
export {
  DEFAULT_WAKE_POLICY,
  isWakePolicy,
  parseWake,
  WAKE_POLICIES,
  type WakePolicy,
  type WakeSettings,
} from "./wake.ts";
export {
  activityWords,
  endingWords,
  imageWords,
  lastWords,
  markerWords,
  modelWords,
  notRunWords,
  placeLabel,
  placeWords,
  runningTriggerFields,
  threadLabel,
  threadName,
  toolStatusWords,
  type TriggerDefined,
  triggerFields,
  triggerHeading,
  triggerState,
  usageWords,
  wakeupNote,
  wakeupWords,
  YOUR_DM,
} from "./words.ts";
export {
  type AgentModels,
  type AnswerEnding,
  type Check,
  type HomeEntry,
  type HomeFile,
  type ModelId,
  type Occurrence,
  type QueuedInput,
  type Reloaded,
  type SessionActivity,
  type SessionImage,
  type SessionItem,
  type SessionPage,
  type SessionPlace,
  type SessionStatus,
  type SessionSummary,
  type Settlement,
  type Submitted,
  type ThreadPlace,
  type ToolStatus,
  type TriggerDetail,
  type TriggerSchedule,
  type TriggerSummary,
  type TurnFailure,
  type WaitingWakeup,
} from "./shapes.ts";
