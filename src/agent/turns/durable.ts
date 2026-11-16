/**
 * The task that follows one input to its end, whichever source it came from. It
 * takes the input up in the commit of the module that has it, hands it to its
 * session, waits for the turn to settle, and tells the input's source how it
 * ended through `Delivery`. It also says which inputs are being worked on. When
 * the engine ends the wait for a turn that the agent's unexpected ends cut off
 * too often, it stops the turn and tells the source it failed. It is the one
 * place that turns the engine's reasons for a turn that ended without an answer
 * into the contract's, which receipts and every view of a session say. It must
 * not know chat, how a reply is posted or a thread is marked as working, or
 * what a session shows a client.
 */
export { answerText, assistantText } from "./answer.durable.ts";
export { failureOf } from "./failure.durable.ts";
export { takeUp } from "./take-up.durable.ts";
export {
  TURN_TASK,
  type TurnTask,
  type TurnTaskOptions,
  turnTask,
  withdrawUnhanded,
} from "./turn-task.durable.ts";
export { createWorking } from "./working.durable.ts";
