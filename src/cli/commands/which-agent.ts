import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { agentsListed, homeNamed } from "../folder/index.ts";
import { UsageError } from "../usage/index.ts";

/** The agent a command is about. */
export interface Target {
  /** The agent as a command takes it: what `--agent` was given, or the home of the agent whose shell this is. */
  readonly given: string;
  /** The agent's home. */
  readonly home: string;
  /** Whether `--agent` named it, in which case a command to run next needs the flag too. */
  readonly flagged: boolean;
}

/**
 * The agent a command acts on: the one `--agent` names, a name or a path, and
 * otherwise the agent whose shell the command runs in, which the launcher in its
 * home says. Run anywhere else with no flag, it is used wrongly, and the error
 * lists the agents the Shrimpy folder has.
 */
export function agentToActOn(flag: string | undefined): Target {
  if (flag !== undefined) return { given: flag, home: homeNamed(flag), flagged: true };
  const shell = process.env[AGENT_HOME_VARIABLE];
  if (shell !== undefined && shell !== "") return { given: shell, home: homeNamed(shell), flagged: false };
  throw new UsageError(`Say which agent: add --agent <agent>, a name or a path.${agentsThere()}`);
}

/** A sentence about the agents the Shrimpy folder has, when it can be read. */
function agentsThere(): string {
  try {
    const { where, names } = agentsListed();
    return names.length === 0 ? ` There are no agents in ${where} yet.` : ` The agents in ${where} are: ${names.join(", ")}.`;
  } catch {
    // A folder that is someone else's is the next command's to refuse. All this needs to say is to name the agent.
    return "";
  }
}

/** A command to run next, as it has to be typed to reach this agent. */
export const command = (target: Target, text: string): string =>
  `shrimpy ${text}${target.flagged ? ` --agent ${target.given}` : ""}`;
