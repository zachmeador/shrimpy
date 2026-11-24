import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { checkAgentName, modelWords } from "../../contracts/agent/index.ts";
import { initHome, providerPaths, readDefaultModel } from "../../contracts/agent/node.ts";
import { fitName, machineFile, NAME_RULE, nameKey } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { saveFile } from "../../lib/files/node.ts";
import { agentsListed, folderPath, homeInFolder, providersFolder, settingsPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { type Account, serviceFor, stateOf } from "../service/index.ts";
import { askLocalGateway } from "../talk/index.ts";
import { firstStop } from "./first-stop.ts";
import { installService } from "./install.ts";
import { signInAtTerminal } from "./signing-in.ts";

/** The first agent's name when the person gives none. */
const FIRST_AGENT = "shrimpy";

/**
 * Whether a bare `shrimpy` at a terminal sets the machine up before it opens the terminal: no gateway answers here,
 * the machine hasn't joined a gateway elsewhere as the person's own, and the Shrimpy folder has no agent yet, or no
 * service running that keeps it running. A service that is installed and not running counts as none, since
 * installing writes its file before it starts it. A gateway that can't be asked for another reason is the
 * terminal's to say.
 */
export async function needsSetup(account: Account): Promise<boolean> {
  const folder = folderPath();
  if (existsSync(machineFile(folder))) return false;
  try {
    if ((await askLocalGateway()) !== undefined) return false;
  } catch {
    return false;
  }
  if (agentsListed().homes.length === 0) return true;
  const service = serviceFor(account, folder);
  if (service === undefined) return false;
  if (!existsSync(service.file)) return true;
  return !(await stateOf(account, service).then(({ running }) => running, () => false));
}

/**
 * Set the machine up at a terminal, one step after another: sign the Shrimpy folder in to a model provider and choose
 * the model agents start with, take the person's name, make the first agent, and keep Shrimpy running as a service.
 * A step that is done already is skipped, so running it again after a failure or a stop picks up where it ended.
 * The result is the exit code.
 */
export async function setUp(io: Io, account: Account): Promise<number> {
  const { signal, release } = firstStop(io);
  try {
    io.out(`Setting Shrimpy up in ${folderPath()}.`);
    const file = providerPaths(providersFolder()).defaultModel;
    const chosen = readDefaultModel(file);
    if (chosen !== undefined) {
      io.out(`Agents start with ${modelWords(chosen)}, as ${file} says.`);
    } else {
      io.out("");
      const signedIn = await signInAtTerminal(io, providersFolder(), undefined, { modelNow: true });
      if (signedIn !== 0) return signedIn;
      if (readDefaultModel(file) === undefined) {
        io.err("Agents need a model to start with. Run shrimpy again once one is set.");
        return 1;
      }
    }
    io.out("");
    const person = await yourName(io, account, signal);
    await firstAgent(io, person, signal);
    io.out("");
    return await installService(io, account);
  } catch (error) {
    if (!signal.aborted) throw error;
    io.err("Stopped. What was set up is kept, and running shrimpy again picks up from there.");
    return 1;
  } finally {
    release();
  }
}

/** The person's name from `settings.json`, or asked for, with the account's name for an answer left empty, and saved there. */
async function yourName(io: Io, account: Account, signal: AbortSignal): Promise<string> {
  const file = settingsPath();
  const settings = settingsObject(file);
  if (typeof settings.name === "string") {
    io.out(`Your agents call you ${settings.name}.`);
    return settings.name;
  }
  for (;;) {
    const answer = await io.ask(`What should your agents call you? Press Enter for ${account.user}: `, { signal });
    const name = fitName(answer === "" ? account.user : answer);
    if (name === undefined) {
      io.out(`Your name ${NAME_RULE}.`);
      continue;
    }
    saveFile(file, `${JSON.stringify({ ...settings, name }, null, 2)}\n`);
    io.out(`Saved your name in ${file}.`);
    return name;
  }
}

/** The settings in `file` as an object, or none when there is no file. */
function settingsObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${file} can't be read: ${asError(error).message}. Fix it, or move it away, and run shrimpy again.`, { cause: error });
  }
  throw new Error(`${file} must hold a JSON object. Fix it, or move it away, and run shrimpy again.`);
}

/** The first agent, made in the Shrimpy folder with the name the person gives, unless the folder has an agent already. */
async function firstAgent(io: Io, person: string, signal: AbortSignal): Promise<void> {
  const [made] = agentsListed().homes;
  if (made !== undefined) {
    io.out(`Your agent ${basename(made)} is in ${made}.`);
    return;
  }
  for (;;) {
    const answer = (await io.ask(`Name your first agent. Press Enter for ${FIRST_AGENT}: `, { signal })).trim();
    const name = answer === "" ? FIRST_AGENT : answer;
    try {
      checkAgentName(name);
    } catch (error) {
      io.out(asError(error).message);
      continue;
    }
    if (nameKey(name) === nameKey(person)) {
      io.out(`${name} is your name, and names are shared by people and agents. Choose another.`);
      continue;
    }
    const { home } = homeInFolder(name);
    const { paths } = initHome(home, { name });
    io.out(`Made the agent ${name} in ${paths.root}. Say who it is in ${paths.soul}, or ask it.`);
    io.out("It runs commands as you, so it can do whatever your account can.");
    return;
  }
}
