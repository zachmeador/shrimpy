/**
 * What an input is, whichever source it comes from: a chat event, an
 * occurrence of a standing or one-shot trigger, a background `bash` process
 * event, or a settled watch on another agent. It holds their shapes, how each
 * reads to the model and how an input's turn can end, as data and words. It
 * must not know the engine, how an input is stored or run, or how its source
 * is told how the turn ended.
 */
export { endingOf, readFinalText } from "./ending.ts";
export {
  attachedOf,
  type Attached,
  type Audience,
  type Backlog,
  type Breadcrumb,
  type Breadcrumbs,
  type ChatInput,
  type Ending,
  type Fired,
  hasReceipt,
  idOf,
  isChat,
  isOccurrence,
  isProcess,
  isUrgent,
  isWatch,
  type ModelChange,
  type Named,
  type Occurrence,
  type OccurrenceInput,
  type Outstanding,
  type PendingWatch,
  type Place,
  type ProcessEvent,
  type ProcessInput,
  type Missed,
  type Said,
  type Snapshot,
  threadOf,
  type TurnOutcome,
  type Watch,
  type WatchInput,
  type WatchResult,
  type WatchSettled,
} from "./input.ts";
export { CAN_END_TURN, promptFor, standing, written } from "./prompt.ts";
