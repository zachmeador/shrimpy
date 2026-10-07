/**
 * Test support for the CLI: captured output, a terminal to open the console
 * on, a model that speaks OpenAI's protocol on a local port, an agent whose
 * side of chat a test scripts, a gateway and chat server to talk through,
 * `shrimpy up` running, waiting for a program to register with the gateway,
 * the CLI itself as a child process, including the commands that serve a
 * program, the shell of an agent that runs it, the finding of `shrimpy` command
 * lines in a text, and a Shrimpy
 * folder of its own for every test, which importing this gives each one so that
 * no test can reach a real `~/shrimpy`. Only tests and test fixtures import
 * this, and it must not know how a program works inside.
 */
export { commandLines, whyNotACommand } from "./commands.ts";
export { useShrimpyDir } from "./folder.ts";
export { declareLocalModel, localProvider } from "./home.ts";
export { type CapturedIo, captureIo } from "./io.ts";
export { type ModelRequest, type ModelServer, startModelServer } from "./model-server.ts";
export { untilRegistered } from "./registered.ts";
export {
  type Outcome,
  type Posted,
  type ScriptedAgent,
  type ScriptedAgentOptions,
  startScriptedAgent,
} from "./scripted-agent.ts";
export { startTalking, type Talking } from "./talking.ts";
export { isAlive, launchUp, type RunningUp, startUp } from "./up.ts";
export {
  type CliResult,
  type LaunchOptions,
  type RunningCommand,
  serve,
  type ServedAgent,
  type ServedChat,
  type ServedGateway,
  serveChat,
  serveGateway,
  shrimpy,
  shrimpyInBackground,
} from "./process.ts";
export { type AgentShell, startAgentShell } from "./shell.ts";
export { FakeTerminal } from "./terminal.ts";
export { type Talk, talkTo } from "./talk.ts";
