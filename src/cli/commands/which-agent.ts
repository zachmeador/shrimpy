import { resolve } from "node:path";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { loadHome } from "../../contracts/agent/node.ts";
import { shellWord } from "../../lib/text/index.ts";
import { agentsListed, isPath } from "../folder/index.ts";
import { homeOnRoster, requireAdminFor, shellActingOn } from "../talk/index.ts";
import { UsageError } from "../usage/index.ts";

/** The agent a command is about. */
export interface Target {
  /** The agent as `--agent` takes it: what `--agent` was given, the name of the only agent the Shrimpy folder has, or the home of the agent whose shell this is. */
  readonly given: string;
  /**
   * Its home on this machine, when `--agent` was given a path, when the command
   * runs in the agent's shell, or when it acts on the only agent the Shrimpy
   * folder has. An agent named on the roster may run anywhere, and has none
   * until a command looks for it.
   */
  readonly home: string | undefined;
  /** Whether a command to run next has to say `--agent` to reach it, which it does unless this is the agent whose shell the command runs in. */
  readonly needsFlag: boolean;
}

/** An agent whose home is on this machine, for a command that reads or changes the home's files. */
export type AtHome = Target & { readonly home: string };

/**
 * The agent a command acts on: the one `--agent` names, a name on the roster or
 * the path to its home, and otherwise the agent whose shell the command runs
 * in, which the launcher in its home says. Run anywhere else with no flag, it
 * acts on the only agent the Shrimpy folder has. With none, or several, it is
 * used wrongly, and the error lists the agents the folder has.
 */
export function agentToActOn(flag: string | undefined): Target {
  if (flag !== undefined) {
    if (flag.trim() === "") throw new UsageError("--agent is empty. Give the agent's name, or the path to its home.");
    return { given: flag, home: isPath(flag) ? resolve(flag) : undefined, needsFlag: true };
  }
  const shell = process.env[AGENT_HOME_VARIABLE];
  if (shell !== undefined && shell !== "") return { given: shell, home: resolve(shell), needsFlag: false };
  const folder = agentsInFolder();
  const [only, ...others] = folder?.homes ?? [];
  if (only !== undefined && others.length === 0) return { given: loadHome(only).name, home: only, needsFlag: true };
  throw new UsageError(`Say which agent: add --agent <agent>, its name or the path to its home.${agentsThere(folder)}`);
}

/**
 * The agent `target` names, with its home on this machine, for a command that
 * reads or changes the home's files. A name is looked up on the roster through
 * the gateway, and its home is found in the Shrimpy folder by the member ID it
 * keeps. An agent whose home is somewhere else can't be acted on from here, and
 * the error says so.
 */
export async function atHome(target: Target): Promise<AtHome> {
  if (target.home !== undefined) return { ...target, home: target.home };
  const home = await homeOnRoster(target.given);
  if (home !== undefined) return { ...target, home };
  throw new Error(
    `${target.given} has no home in ${agentsListed().where}, so it lives somewhere else. This command reads or changes ` +
      "the files of its home, and works only where it lives.",
  );
}

/** The option every command about one agent takes, to name an agent that is not the one whose shell it runs in. */
export const AGENT_OPTION = { agent: { type: "string" } } as const;

/** What the help of a command that takes an <agent> to make or start says an <agent> is. */
export const AN_AGENT =
  "An <agent> is a name or a path. A name, like scout, is the home agents/scout in your Shrimpy folder. " +
  "Anything with a / in it, or that starts with . or ~, is a path, so ./scout is a folder here.";

/** What the help of a command about one agent says --agent takes. */
export const AGENT_NAMED =
  "--agent takes the agent's name on the roster, like scout, which reaches it through the gateway wherever it runs, " +
  "or the path to its home, anything with a / in it or that starts with . or ~, which reaches a home on this machine " +
  "with no gateway.";

/** What the help of a command about one agent says about which agent that is. */
export const WHICH_AGENT =
  "With no --agent it acts on the agent whose shell it runs in, and in your own terminal on the only agent your " +
  `Shrimpy folder has. --agent <agent> acts on another, and is needed when the folder has more than one agent. ${AGENT_NAMED}`;

/** What the help of a command that acts on an agent says about acting on another agent's. */
export const ABOUT_ANOTHER_AGENT =
  "Run in the shell of an agent, about another agent, it goes through the gateway as that agent and takes an admin.";

/** What the help of a command that reads or changes the files of an agent's home says about where that agent can be. */
export const ITS_FILES = "It reads or changes the files of the agent's home, so the home has to be on this machine.";

/**
 * Before a command changes, or looks at, the files of the agent `target` names,
 * which no agent is there to guard. Run in the shell of another agent, it asks
 * the gateway whether that agent is an admin, and refuses if it is not; `what`
 * is what takes an admin, written to start a sentence. Run anywhere else, or in
 * the shell of the agent itself, it does nothing.
 */
export async function mayActOn(target: AtHome, what: string): Promise<void> {
  if (shellActingOn(target.home) !== undefined) await requireAdminFor(target.home, what);
}

/** The homes the Shrimpy folder has, or undefined when it can't be read. */
function agentsInFolder(): ReturnType<typeof agentsListed> | undefined {
  try {
    return agentsListed();
  } catch {
    // A folder that is someone else's is the next command's to refuse. All this needs to say is to name the agent.
    return undefined;
  }
}

/** A sentence about the agents the Shrimpy folder has, by name, when it could be read. */
function agentsThere(folder: ReturnType<typeof agentsInFolder>): string {
  if (folder === undefined) return "";
  const { where, homes } = folder;
  if (homes.length === 0) return ` There are no agents in ${where} yet.`;
  return ` The agents in ${where} are: ${homes.map((home) => loadHome(home).name).join(", ")}.`;
}

/** A command to run next, as it has to be typed to reach this agent. */
export const command = (target: Target, text: string): string =>
  `shrimpy ${text}${target.needsFlag ? ` --agent ${shellWord(target.given)}` : ""}`;
