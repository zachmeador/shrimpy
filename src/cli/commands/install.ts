import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { formatAddress } from "../../contracts/gateway/index.ts";
import { keptListenAddresses } from "../../gateway/index.ts";
import { defaultFolderPath, FOLDER_VARIABLE, folderPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { shrimpyCommand } from "../programs/index.ts";
import {
  type Account,
  disableLingering,
  enableLingering,
  keepLingering,
  lingers,
  type Program,
  put,
  remove,
  type Service,
  serviceFor,
  STOP_SECONDS,
  stateOf,
  thisAccount,
} from "../service/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { shellWord } from "./shell-word.ts";
import { alreadyRunning, type Plan, planUp } from "./up.ts";

const install: Command = {
  name: "gateway install",
  usage: "",
  summary: "Run shrimpy up for your Shrimpy folder as a service of your account, started again if it fails.",
  details: [
    "Sets up a service for the account that runs this, which runs shrimpy up for your Shrimpy folder, which is " +
      "~/shrimpy or the folder SHRIMPY_DIR names, and starts it. On Linux that is a systemd user unit in " +
      "~/.config/systemd/user/. On macOS it is a LaunchAgent in ~/Library/LaunchAgents/, and what it prints goes to " +
      "a file in ~/Library/Logs/. It starts again if it fails. It runs this Shrimpy, with the Node and the entry " +
      "point that run this command, and gets the PATH of the shell that runs this, so that an agent's shell finds " +
      "what yours does. On any other system it says so, and how to run shrimpy up under whatever keeps programs " +
      "running there.",
    "One folder has one service. The default folder's is called shrimpy. Any other folder gets a name made from " +
      "the folder, and the service is told the folder, so two folders never share one. To install for another " +
      "folder, run this with SHRIMPY_DIR set to it.",
    "On Linux a user service stops when the account's last login ends, unless the account lingers, so this " +
      "turns lingering on. When that takes an administrator, the service is installed and started all the same, " +
      "and this prints the command that turns lingering on and says what happens until it is run.",
    "Running it again writes the service again and restarts it, and says which it did. It refuses to install " +
      "while shrimpy up already runs for the folder, started by hand or by a service of your own, since the " +
      "service would find everything running and start nothing: stop that one first. It also refuses when the " +
      "folder has no agents and the gateway keeps no address to listen on, since a service would have nothing to " +
      "start.",
    "It says what it installed and where the file is, what shrimpy up starts there (the gateway, the chat " +
      "server and the agents, or only the agents when they all belong to a gateway elsewhere), how to see what it " +
      "prints, and how to take it away. The service follows the folder, as shrimpy up does with no agents " +
      "named: an agent made later is started within a few seconds, and an agent that stops is started again.",
  ].join("\n\n"),
  run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    return installService(io, thisAccount());
  },
};

const uninstall: Command = {
  name: "gateway uninstall",
  usage: "",
  summary: "Stop your Shrimpy folder's service and remove it. Nothing of Shrimpy's is deleted.",
  details:
    "Stops the service that gateway install set up for your Shrimpy folder, which is ~/shrimpy or the folder " +
    "SHRIMPY_DIR names, and removes it. Your Shrimpy folder and everything in it are left as they are, and so is " +
    "the log file on macOS. On Linux it leaves lingering as it is, and says how to turn it off. With no service " +
    "installed it says so and exits 0. A service for another folder is removed with SHRIMPY_DIR set to that folder.",
  run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);
    return uninstallService(io, thisAccount());
  },
};

/** The names as one phrase: `a`, `a and b`, `a, b and c`. */
const listed = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;

/** What `shrimpy up` starts, as a phrase: the gateway, the chat server and the agents, or only the agents. */
function whatItStarts(plan: Plan): string {
  const agents = plan.homes.map((home) => basename(home));
  const these = `${agents.length === 1 ? "the agent" : "the agents"} ${listed(agents)}`;
  if (plan.here === undefined) {
    const gateways = plan.elsewhere.map(formatAddress);
    return (
      `only ${these}, and no gateway or chat server, since ${agents.length === 1 ? "its" : "their"} ` +
      `gateway${gateways.length === 1 ? " is" : "s are"} at ${listed(gateways)}`
    );
  }
  if (agents.length === 0) {
    const where = keptListenAddresses(join(plan.here.data, "gateway")).map(formatAddress);
    return `the gateway and the chat server, which listen on ${listed(where)} for agents that live elsewhere`;
  }
  return `the gateway, the chat server and ${these}`;
}

/** How to run shrimpy up where Shrimpy installs no service. */
function noServiceHere(account: Account, program: Program, folder: string): string {
  const environment =
    folder === defaultFolderPath(account.home)
      ? "the PATH you want its agents' shells to have"
      : `${FOLDER_VARIABLE}=${shellWord(folder)} and the PATH you want its agents' shells to have`;
  return [
    `Shrimpy installs a service with systemd on Linux and with launchd on macOS, and this is ${account.platform}. ` +
      "To keep Shrimpy running here, run this under whatever keeps programs running on this system, and start it " +
      "again if it fails:",
    `  ${program.argv.map(shellWord).join(" ")}`,
    `Give it ${environment}. It stops what it started one program at a time when it gets SIGTERM, so allow a ` +
      `stop up to ${String(STOP_SECONDS)} seconds.`,
  ].join("\n");
}

/** How to take the service away: the command, with the folder it is for when that is not the default. */
const uninstallCommand = (service: Service): string =>
  `${service.plain ? "" : `${FOLDER_VARIABLE}=${shellWord(service.folder)} `}shrimpy gateway uninstall`;

/**
 * Set up the service for the Shrimpy folder on this account and start it, or write it again and restart it if it is
 * there, and say what it did. It refuses before it changes anything when there is nothing for a service to start,
 * or when `shrimpy up` runs already.
 */
export async function installService(io: Io, account: Account): Promise<number> {
  const folder = folderPath();
  const program: Program = { argv: [...shrimpyCommand(), "up"], path: account.path };
  const service = serviceFor(account, folder);
  if (service === undefined) throw new Error(noServiceHere(account, program, folder));

  const plan = planUp([], undefined, undefined, folderPath);
  if (plan === undefined) {
    throw new Error(
      `There are no agents in ${join(folder, "agents")} yet and the gateway keeps no address to listen on, so a ` +
        "service would have nothing to start. Make an agent first, with: shrimpy agent init <name> --model <provider/id>. " +
        "For agents that live elsewhere, run shrimpy up --listen <host:port> once instead: the gateway keeps the " +
        "address, and the service listens there.",
    );
  }
  // Programs that run are this service's own when it runs, and it is restarted below. Any others would leave it nothing to start.
  const running = existsSync(service.file) && (await stateOf(account, service)).running;
  if (!running && (await alreadyRunning(plan))) {
    throw new Error(
      `Shrimpy already runs for ${folder}, started by hand with shrimpy up or by a service of your own, so this ` +
        "service would find everything running and start nothing. Stop that one first (Ctrl+C in the terminal " +
        "that runs shrimpy up), then run this again.",
    );
  }

  const { updated } = await put(account, service, program).catch((error: unknown) => {
    if (!existsSync(service.file) || !(error instanceof Error)) throw error;
    throw new Error(`${error.message}\n${service.file} is in place. Run shrimpy gateway install again once that works.`, {
      cause: error,
    });
  });

  io.out(`${updated ? "Updated" : "Installed"} the service ${service.name} for ${folder} and ${updated ? "restarted" : "started"} it.`);
  io.out(`Its ${service.manager === "systemd" ? "unit file" : "LaunchAgent"} is ${service.file}.`);
  io.out(`It runs shrimpy up, which starts ${whatItStarts(plan)}. It starts again if it fails.`);
  if (service.manager === "systemd") {
    const lingering = await keepLingering(account);
    if (lingering.state === "refused") {
      io.out(`Lingering is off for ${account.user}, and turning it on failed: ${lingering.why}`);
      io.out(`Until it is on, the service stops when ${account.user}'s last login ends. An administrator turns it on with:`);
      io.out(`  ${enableLingering(account)}`);
    } else {
      io.out(`${lingering.state === "was on" ? "Lingering is on" : "Turned lingering on"} for ${account.user}, so the service keeps running after the last login ends.`);
    }
    io.out(`See what it prints with: journalctl --user -u ${service.name} -f`);
  } else {
    io.out(`It prints to ${service.log}. See it with: tail -f ${shellWord(service.log)}`);
  }
  io.out(`Take it away with: ${uninstallCommand(service)}`);
  return 0;
}

/** Stop the service for the Shrimpy folder on this account and remove it, and say what is left as it was. */
export async function uninstallService(io: Io, account: Account): Promise<number> {
  const folder = folderPath();
  const service = serviceFor(account, folder);
  if (service === undefined) {
    io.out(`No service is installed for ${folder}: Shrimpy installs none on ${account.platform}.`);
    return 0;
  }
  if (!existsSync(service.file)) {
    io.out(`No service is installed for ${folder}: ${service.file} is not there.`);
    return 0;
  }

  await remove(account, service);
  io.out(`Stopped the service ${service.name} and removed ${service.file}.`);
  io.out(
    service.log === undefined
      ? `${folder} and everything in it are as they were.`
      : `${folder} and everything in it are as they were, and so is the log, ${service.log}.`,
  );
  if (service.manager === "systemd" && (await lingers(account))) {
    io.out(`Lingering is still on for ${account.user}. To turn it off: ${disableLingering(account)}`);
  }
  return 0;
}

/**
 * The line `gateway status` ends with: whether a service is installed for the Shrimpy folder, and whether it runs.
 * None where Shrimpy installs no service.
 */
export async function serviceStatusLine(account: Account): Promise<string | undefined> {
  const folder = folderPath();
  const service = serviceFor(account, folder);
  if (service === undefined) return undefined;
  if (!existsSync(service.file)) return `No service is installed for ${folder}. shrimpy gateway install sets one up.`;
  try {
    const { running, detail } = await stateOf(account, service);
    if (running) return `The service ${service.name} is installed for ${folder} and running.`;
    return `The service ${service.name} is installed for ${folder} and not running (${detail}). shrimpy gateway install starts it again.`;
  } catch (error) {
    return `The service ${service.name} is installed for ${folder}. It could not be asked whether it runs: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const installCommands: Command[] = [install, uninstall];
