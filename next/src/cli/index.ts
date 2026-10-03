/**
 * The `shrimpy` command. It creates and starts agents through the agent
 * program's front door and talks to running ones through the agent contract.
 * It must not open a home's storage or know how an agent's engine works.
 */
export { type Io, processIo } from "./io/index.ts";
export { runCli } from "./run.ts";
