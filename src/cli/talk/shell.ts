import { resolve } from "node:path";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";

/**
 * The home of the agent whose shell this command runs in, when `home` is
 * another agent's. A command run anywhere else, and one about the shell's own
 * agent, has none: it is a person's, or the agent's own, and uses the home's
 * path.
 */
export function shellActingOn(home: string): string | undefined {
  const shell = process.env[AGENT_HOME_VARIABLE];
  if (shell === undefined || shell === "" || resolve(shell) === resolve(home)) return undefined;
  return shell;
}
