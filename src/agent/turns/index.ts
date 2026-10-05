/**
 * The task that follows one input to its end, whichever source it came from. It
 * takes the input up in the commit of the module that has it, hands it to its
 * session, waits for the turn to settle, and tells the input's source how it
 * ended through `Delivery`. It also says which inputs are being worked on, and
 * counts what a crash of the agent costs a turn that was underway, giving up on
 * one that has crashed too often. It must not know chat, how a reply is posted
 * or a thread is marked as working, or what a session shows a client.
 */
export { answerText, assistantText, describe } from "./answer.ts";
export { beginRun, type Run } from "./crashes.ts";
export { takeUp } from "./take-up.ts";
export {
  type Delivery,
  liveTurns,
  TURN_TASK,
  type TurnTask,
  type TurnTaskOptions,
  turnTask,
  withdrawUnhanded,
} from "./turn-task.ts";
export { createWorking, type Working } from "./working.ts";
