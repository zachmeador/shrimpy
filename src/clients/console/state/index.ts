/**
 * What the console knows and can do, without a terminal: where the person is,
 * which agents run, their threads, the open thread and the work behind it, what
 * is connected, and the things a person does: pick an agent or a thread, start
 * one, say something, stop the work, go back, leave. Everything it learns comes
 * through the console's links. It must not know how any of this is shown or
 * drawn, or what a key does.
 */
export { type ConsoleState, type ConsoleStateOptions, createConsoleState } from "./store.ts";
export {
  type AgentEntry,
  agentEntries,
  type Dm,
  type Farewell,
  type Model,
  type Notice,
  type SendResult,
  type Where,
  workingIn,
} from "./model.ts";
