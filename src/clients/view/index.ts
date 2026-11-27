/**
 * What a client shows, as plain text and facts, a level at a time: for the
 * state it is given, the agents and rooms, what the open one takes part in,
 * the open agent's page and a file of its home, the open thread with every
 * agent's work and what is still going in it, and the session on show; what is
 * new to the person, how each agent looks, what is not working, what can be
 * written after a slash and what comes of it, and every sentence a client says
 * but those that name its keys or gestures, which are its own. Everything that
 * came from another member, an agent or a tool passes through here made
 * harmless for a terminal, so nothing downstream has to trust it. It must not
 * know how anything is drawn, or reach the network.
 */
export { type AgentsLevel, agentsLevel } from "./agents.ts";
export {
  type CommandLine,
  commandFits,
  commandsFitting,
  commandWord,
  modelFits,
  type ModelLine,
  modelLines,
  modelsFitting,
  modelWord,
  offersModels,
} from "./commands.ts";
export { BRIEF, type LevelOptions, type Row } from "./level.ts";
export { type ListLevel, listLevel, type ListOptions, nothingOpen, tabHolding } from "./list.ts";
export type { Look } from "./look.ts";
export {
  type Fact,
  type FileLevel,
  fileLevel,
  type HomeRow,
  type OnceCard,
  pageLevel,
  type PageLevel,
  type PageOptions,
  type ProcessCard,
  type TriggerCard,
} from "./page.ts";
export { sessionLevel, type SessionLevel, type SessionOptions, type Side } from "./session.ts";
export {
  type AgentWork,
  type FileRow,
  type Mention,
  type MessageRow,
  type ReverseWatch,
  type StatusBlock,
  type StillProcess,
  type StillTrigger,
  type StillWatch,
  threadLevel,
  type ThreadLevel,
  type ThreadOptions,
  type ThreadStill,
  type WakeRow,
  withMentions,
} from "./thread.ts";
export type { ImageShown, Step, Work } from "./work.ts";
export {
  AGENT_TABS,
  type AgentTab,
  backgroundCommandsCount,
  browserLabel,
  commandParts,
  EMPTY,
  farewellLine,
  FIRED,
  type InFull,
  LABELS,
  MODEL_DEFAULT,
  moreCount,
  moreListed,
  NEW_SINCE,
  NEW_SINCE_SHORT,
  nextTry,
  NOT_RUNNING,
  notificationTitle,
  OUT_OF_DATE,
  OUT_OF_DATE_MARK,
  reactionsLine,
  READ_ONLY_TAG,
  type SaidPart,
  SOMETHING_NEW,
  thenStart,
  thinkingShown,
  toolCallsShown,
  unreadableJoin,
  versionLine,
  windowTitle,
  writeTo,
} from "./words.ts";
