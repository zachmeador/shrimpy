import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { UsageError } from "../usage/index.ts";

/** The variable that names a Shrimpy folder other than the default. */
export const FOLDER_VARIABLE = "SHRIMPY_DIR";

/** The folder of the Shrimpy folder that holds one home for each agent. */
const AGENTS = "agents";

/** The folder of the Shrimpy folder that holds the sign-ins, keys and model servers every agent started there shares. */
const PROVIDERS = "providers";

/** What marks a folder as Shrimpy's: either is made first on a new setup, a home or a sign-in. */
const MARKS = [AGENTS, PROVIDERS];

/** The file that makes a folder of `agents/` an agent's home. */
const HOME_FILE = "agent.json";

const MAKE_AN_AGENT = "shrimpy agent init <name> --model <provider/id>";

/** Where the Shrimpy folder is: `SHRIMPY_DIR` when it is set, and `shrimpy` in the person's own folder when not. Nothing is read or made. */
export function folderPath(): string {
  const given = process.env[FOLDER_VARIABLE];
  return given === undefined || given === "" ? join(homedir(), "shrimpy") : resolve(given);
}

/**
 * Where the Shrimpy folder's `providers/` is, which an agent is told when it is
 * started and never looks for. Nothing is read or made: an agent takes what is
 * there, and a folder with no `providers/` gives it nothing.
 */
export function providersPath(): string {
  return join(folderPath(), PROVIDERS);
}

/**
 * The Shrimpy folder's `providers/`, for a command that writes there. The folder
 * must be Shrimpy's, as it must for everything else that makes something in it.
 * Nothing is made yet: whatever writes makes `providers/` when it has something
 * to put in it.
 */
export function providersFolder(): string {
  return join(ownFolder(), PROVIDERS);
}

/** Whether `word` is a path, and not the name of an agent: it has a path separator in it, or starts with `.` or `~`. */
export function isPath(word: string): boolean {
  return word.includes("/") || word.includes(sep) || word.startsWith(".") || word.startsWith("~");
}

/**
 * The Shrimpy folder, once it is known to be Shrimpy's: it is not there yet,
 * or it holds nothing but dot files, such as the `.DS_Store` Finder leaves, or
 * it has an `agents/` or a `providers/` folder. A folder with other files and
 * neither, such as a clone of this repository, belongs to someone else, and
 * nothing is made in it.
 */
function ownFolder(): string {
  const folder = folderPath();
  if (!existsSync(folder)) return folder;
  if (!statSync(folder).isDirectory()) {
    throw new Error(
      `${folder} is a file, so Shrimpy can't keep its folder there. ` +
        `Set ${FOLDER_VARIABLE} to another folder, or move this file.`,
    );
  }
  const marked = MARKS.some((mark) => existsSync(join(folder, mark)));
  if (marked || readdirSync(folder).every((entry) => entry.startsWith("."))) return folder;
  throw new Error(
    `${folder} has other files in it and no ${AGENTS}/ or ${PROVIDERS}/ folder, so Shrimpy won't make anything there. ` +
      `Set ${FOLDER_VARIABLE} to another folder, or move this one.`,
  );
}

/** The agents the Shrimpy folder has: the folders of `agents/` that hold an `agent.json`, by name. */
function agentsIn(folder: string): string[] {
  const agents = join(folder, AGENTS);
  if (!existsSync(agents)) return [];
  return readdirSync(agents)
    .filter((name) => existsSync(join(agents, name, HOME_FILE)))
    .sort();
}

/** The home of the agent called `name` in `folder`: the folder of that name in `agents/`. */
function homeIn(folder: string, name: string): string {
  if (name === "") throw new UsageError("The agent's name is empty. Give a name, like scout, or a path.");
  return join(folder, AGENTS, name);
}

/**
 * The home an `<agent>` argument means. A path is that folder. A name is the
 * agent of that name in the Shrimpy folder, which must have one: the error
 * lists the agents it does have, and says how to make this one.
 */
export function homeNamed(word: string): string {
  if (isPath(word)) return resolve(word);
  const folder = ownFolder();
  const home = homeIn(folder, word);
  if (existsSync(join(home, HOME_FILE))) return home;

  const agents = agentsIn(folder);
  const where = join(folder, AGENTS);
  const missing =
    agents.length === 0
      ? `There is no agent called ${word}, and ${where} has no agents yet.`
      : `There is no agent called ${word} in ${where}. The agents there are: ${agents.join(", ")}.`;
  // A home in the current directory with this name is probably what was meant, and takes `./` to reach.
  const here = existsSync(join(resolve(word), HOME_FILE)) ? ` To use the folder in this directory, write ./${word}.` : "";
  throw new Error(`${missing} Make it with: ${MAKE_AN_AGENT.replace("<name>", () => word)}${here}`);
}

/** Where `agent init` makes the home `word` means: that path, or the folder named for it in the Shrimpy folder's `agents/`. */
export function newHome(word: string): string {
  return isPath(word) ? resolve(word) : homeIn(ownFolder(), word);
}

/**
 * The agents the Shrimpy folder has, by name, and the folder of `agents/` they
 * are in, for an error that has to say which to name. Nothing is made, and a
 * folder that is someone else's is refused as it is anywhere else.
 */
export function agentsListed(): { where: string; names: string[] } {
  const folder = ownFolder();
  return { where: join(folder, AGENTS), names: agentsIn(folder) };
}

/** The homes of every agent in the Shrimpy folder, for `up` when it is told no agents. With none, the error says how to make one. */
export function allHomes(): string[] {
  const folder = ownFolder();
  const names = agentsIn(folder);
  if (names.length === 0) {
    throw new Error(
      `There are no agents in ${join(folder, AGENTS)} yet, so there is nothing to start. Make one with: ${MAKE_AN_AGENT}`,
    );
  }
  return names.map((name) => join(folder, AGENTS, name));
}

/**
 * The folder `up` keeps the gateway's and the chat server's data in when it is
 * not told another: the Shrimpy folder, with its `agents/` folder made first,
 * because that is what tells the next command the folder is Shrimpy's.
 */
export function dataFolder(): string {
  const folder = ownFolder();
  mkdirSync(join(folder, AGENTS), { recursive: true });
  return folder;
}
