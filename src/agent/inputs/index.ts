/**
 * What an input is, whichever source it comes from: a chat event, a wake-up the
 * agent asked for, an occurrence of a trigger or the result of a question the
 * agent asked another agent. It holds their shapes, how each reads to the model,
 * and how an input's turn can end, as data and words. It must not know the
 * engine, how an input is stored or run, or how its source is told how the turn
 * ended.
 */
export { endingOf, readFinalText } from "./ending.ts";
export {
  type Asked,
  type Audience,
  type Backlog,
  type Breadcrumb,
  type Breadcrumbs,
  type CameBack,
  type ChatInput,
  type Ending,
  hasReceipt,
  idOf,
  isChat,
  isOccurrence,
  isQuestion,
  isUrgent,
  isWakeup,
  type ModelChange,
  type Named,
  type Occurrence,
  type OccurrenceInput,
  type Outstanding,
  type Place,
  type Question,
  type QuestionInput,
  type QuestionResult,
  type Said,
  type Snapshot,
  threadOf,
  type TurnOutcome,
  type Wakeup,
  type WakeupInput,
} from "./input.ts";
export { promptFor, standing, written } from "./prompt.ts";
