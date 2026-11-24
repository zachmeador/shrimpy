/**
 * Test support for the CLI: captured output, the console opened from the
 * command line on a terminal of a test's own, a model that speaks OpenAI's
 * protocol on a local port and the home of an agent that uses it, an agent whose
 * side of chat a test scripts, a gateway and chat server to talk through,
 * `shrimpy up` running, also with pauses of a test's own, and what it runs as
 * the process table lists it, waiting for a gateway to answer, a program to
 * link to it or an agent to answer at its home, the roster as you see it and
 * roles changed on it, the CLI itself as a child process, including the command
 * that serves an agent, the shell of an agent that runs it, the finding of
 * `shrimpy` command lines in a text, free loopback addresses to listen on,
 * programs of a test's own put first on its PATH, and a Shrimpy folder and a
 * home directory of their own for every test, and a PATH with no way to the
 * machine's service manager, which importing this gives each one so that no
 * test can reach a real `~/shrimpy`, look in the person's own home or run a
 * real `systemctl`. Only tests and test fixtures import this, and it must not
 * know how a program works inside.
 */
export { canConnect, freeAddresses } from "./addresses.ts";
export { commandLines, whyNotACommand } from "./commands.ts";
export { openConsoleOn } from "./console.ts";
export { firstOnPath, useShrimpyDir } from "./folder.ts";
export { agentHome, declareLocalModel, localProvider } from "./home.ts";
export { captureIo } from "./io.ts";
export { type ModelServer, startModelServer } from "./model-server.ts";
export { untilAnswering, untilGatewayAnswers, untilLinked } from "./linked.ts";
export { type Outcome, type Posted, startScriptedAgent } from "./scripted-agent.ts";
export { startTalking } from "./talking.ts";
export { isAlive, launchUp, type RunningUp, type UpProgram } from "./up.ts";
export { type LaunchOptions, serve, type ServedAgent, shrimpy, shrimpyInBackground } from "./process.ts";
export { type OnTheRoster, onTheRoster, setAdmin } from "./roster.ts";
export { startAgentShell } from "./shell.ts";
