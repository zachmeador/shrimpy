import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { agentsListed, homeNamed } from "../folder/index.ts";
import { requireAdminFor, shellActingOn } from "../talk/index.ts";
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

/** The option every command about one agent takes, to name an agent that is not the one whose shell it runs in. */
export const AGENT_OPTION = { agent: { type: "string" } } as const;

/** What the help of a command about one agent says about which agent that is. */
export const WHICH_AGENT =
  "It acts on the agent whose shell it runs in. Anywhere else, name the agent with --agent <agent>, a name or a path.";

/** What the help of a command that acts on an agent says about acting on another agent's. */
export const ABOUT_ANOTHER_AGENT =
  "Run in the shell of an agent, about another agent, it goes through the gateway as that agent and takes an admin.";

/**
 * Before a command changes, or looks at, the files of the agent `target` names,
 * which no agent is there to guard. Run in the shell of another agent, it asks
 * the gateway whether that agent is an admin, and refuses if it is not; `what`
 * is what takes an admin, written to start a sentence. Run anywhere else, or in
 * the shell of the agent itself, it does nothing.
 */
export async function mayActOn(target: Target, what: string): Promise<void> {
  const shell = shellActingOn(target.home);
  if (shell !== undefined) await requireAdminFor(shell, target.home, what);
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
