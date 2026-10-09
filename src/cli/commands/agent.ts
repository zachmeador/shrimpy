import { basename, dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  checkAgentName,
  type HomeAgent,
  initHome,
  JoinFailedError,
  type JoinedHome,
  joinHome,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
  previewHomeContext,
  providerPaths,
  startHomeAgent,
} from "../../agent/index.ts";
import { readEndpoint } from "../../contracts/agent/node.ts";
import { formatAddress, type Link, readLink } from "../../contracts/gateway/index.ts";
import { homeInFolder, homeNamed, isPath, newHome, providersPath } from "../folder/index.ts";
import { shrimpyCommand } from "../programs/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { connectIfRunning } from "./connected.ts";
import { folderDefault } from "./folder-default.ts";
import { leftOutLines, whatItReads } from "./reloaded.ts";
import { ABOUT_ANOTHER_AGENT, AGENT_OPTION, agentToActOn, mayActOn, WHICH_AGENT } from "./which-agent.ts";

const init: Command = {
  name: "agent init",
  usage: "<agent> [--model <provider/id>] [--name <name>]",
  summary: "Create an agent home. Files that already exist are left as they are.",
  details:
    "The agent is named for the folder of its home unless --name gives it another name. Without --model it " +
    "names no model, and starts with the one in providers/default-model.json in your Shrimpy folder, which " +
    "is ~/shrimpy or the folder SHRIMPY_DIR names.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { name: { type: "string" }, model: { type: "string" } },
        allowPositionals: true,
      }),
    );
    const [given] = expectArguments(positionals, ["<agent>"]);
    const model = values.model === undefined ? undefined : modelFromFlag(values.model);

    const home = newHome(given);
    const name = values.name ?? folderName(home);
    const { paths, created } = initHome(home, { name, ...(model === undefined ? {} : { model }) });
    if (created.length === 0) {
      io.out(`The agent ${name} is already set up in ${paths.root}. Nothing was changed.`);
      return 0;
    }
    // A home in the Shrimpy folder is found by its name, and one anywhere else by its path.
    const named = !isPath(given);
    // Where an agent's model and its access come from: its own files first, then the Shrimpy folder's providers/.
    const folder = providerPaths(providersPath());
    const shared = model === undefined ? folderDefault(folder.defaultModel) : undefined;
    io.out(
      model !== undefined
        ? `Created the agent ${name} in ${paths.root}, with the model ${modelLabel(model)}.`
        : shared !== undefined
          ? `Created the agent ${name} in ${paths.root}. It names no model, so it starts with ${modelLabel(shared)}, your Shrimpy folder's default.`
          : `Created the agent ${name} in ${paths.root}. It names no model, so it starts with the one in ${folder.defaultModel}.`,
    );
    io.out("");
    io.out("Next:");
    const own = dirname(paths.models);
    const steps: string[][] = [];
    if (model !== undefined) {
      steps.push([
        `Give ${name} access to its model's provider. This signs in for every agent in your Shrimpy folder, ` +
          "unless it is signed in already:",
        "     shrimpy providers login",
        `   Or, for ${name} alone, declare a server in models.json or add a key to auth.json in ${own}.`,
      ]);
    } else if (shared === undefined) {
      // A folder that has a default model was set up for its agents already, and starting says what is missing if it wasn't.
      steps.push([
        `Choose ${name}'s model and give it access. This signs in to a provider for every agent in your Shrimpy ` +
          "folder, and asks which model they start with:",
        "     shrimpy providers login",
        `   Or, for ${name} alone, name a model under "model" in ${paths.config}, and declare a server in ` +
          `models.json or add a key to auth.json in ${own}.`,
      ]);
    }
    steps.push(
      [`Say who ${name} is in ${paths.soul}. It starts with a few plain defaults that work as they are.`],
      named
        ? [
            `If Shrimpy is running, ${name} starts by itself in a few seconds. If it isn't, start Shrimpy:`,
            "     shrimpy up",
          ]
        : [
            "Start it:",
            `     shrimpy up ${paths.root}`,
            "   Or, if Shrimpy is already running, add the agent to it:",
            `     shrimpy agent serve ${paths.root}`,
          ],
    );
    steps.forEach(([first, ...rest], index) => {
      io.out(`  ${index + 1}. ${first}`);
      for (const line of rest) io.out(`  ${line}`);
    });
    return 0;
  },
};

/** The name an agent gets when `--name` gives none: the name of its home's folder, if an agent can have that name. */
function folderName(home: string): string {
  const name = basename(home);
  try {
    checkAgentName(name);
  } catch (error) {
    throw new UsageError(
      `${(error as Error).message} An agent is named for its folder; --name gives it a name that differs from its folder's.`,
    );
  }
  return name;
}

function modelFromFlag(flag: string): ModelChoice {
  try {
    return parseModelChoice(flag);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

/** How long to wait for a gateway that does not answer, in milliseconds. */
const GIVE_UP_MS = 15_000;

const join: Command = {
  name: "agent join",
  usage: "<link>",
  summary: "Make an agent here that joins a gateway elsewhere, with the link of an invitation.",
  details:
    "Run this where the agent will live, with the link that shrimpy members invite printed on the gateway's " +
    "machine. The agent's home is agents/<name> in your Shrimpy folder, which is ~/shrimpy or the folder " +
    "SHRIMPY_DIR names. If there is none, it is made as agent init <name> makes it, with no model; one that is " +
    "there must be that agent. This makes the agent's token, shows the gateway the name, the code and the " +
    "token, and keeps the gateway's address in the home, where shrimpy up finds it: the agent connects to " +
    "that gateway from then on, and is talked to from the gateway's machine. It says whether the gateway let " +
    "the agent in, and on standard error whether the gateway runs another version of Shrimpy than this command. " +
    "It gives up on a gateway that does not answer within fifteen seconds. A failure leaves a home that was " +
    "just made, and running this again with the same link is safe while the code is good: an invitation works " +
    "once, for fifteen minutes, and only for the name it was made for. A home that has joined a gateway " +
    "already is refused, and the error names the file to delete to join anew. A link for another machine of " +
    "yours, which names no agent, is refused too: shrimpy join takes that one.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [text] = expectArguments(positionals, ["<link>"]);
    const { name, address } = invitationIn(text);

    const { home, exists } = homeInFolder(name);
    if (!exists) initHome(home, { name });
    const where = formatAddress(address);
    const gaveUp = new AbortController();
    const timer = setTimeout(() => gaveUp.abort(), GIVE_UP_MS);
    let joined: JoinedHome;
    try {
      joined = await joinHome(home, text, { signal: gaveUp.signal });
    } catch (error) {
      // Only an attempt that was made can be made again. A link that does not fit the home is said as it is.
      if (!(error instanceof JoinFailedError)) throw error;
      let said = error.message;
      if (gaveUp.signal.aborted) said = `The gateway at ${where} did not answer within fifteen seconds.`;
      const stays = exists ? "" : `The agent's home, ${home}, was made and stays. `;
      throw new Error(`${said}\n${stays}Running this again with the same link is safe while the code is good.`, { cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (joined.gatewayVersion !== undefined) warnIfVersionDiffers(io, "the gateway", joined.gatewayVersion);
    io.out(
      `${name} joined the gateway at ${where}. ` +
        (exists ? `Its home is ${home}.` : `Its home is ${home}, made just now with no model.`),
    );
    io.out("");
    io.out("Next:");
    const steps: string[][] = [];
    if (folderDefault(providerPaths(providersPath()).defaultModel) === undefined) {
      steps.push([
        "Choose a model and sign in, which every agent started in this folder uses:",
        "     shrimpy providers login",
      ]);
    }
    steps.push([
      `If Shrimpy is running here, ${name} starts by itself in a few seconds. If it isn't, start Shrimpy:`,
      "     shrimpy up",
      "   It connects to the gateway by itself from then on, and you talk to it from the gateway's machine.",
    ]);
    steps.forEach(([first, ...rest], index) => {
      io.out(`  ${index + 1}. ${first}`);
      for (const line of rest) io.out(`  ${line}`);
    });
    return 0;
  },
};

/**
 * What the link says, or a usage error that says what is wrong with it: it is not a link, it is for another machine
 * of the person's own and names no agent, or it names an agent that can't be made.
 */
function invitationIn(text: string): Link & { name: string } {
  try {
    const link = readLink(text);
    if (link.name === null) {
      throw new Error("That link is for another machine of yours, and names no agent. Use shrimpy join <link> for it.");
    }
    checkAgentName(link.name);
    return { ...link, name: link.name };
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

const serve: Command = {
  name: "agent serve",
  usage: "<agent> [--now]",
  summary: "Run the agent in the foreground until it is told to stop.",
  details:
    "Prints one JSON line when it is listening. What the agent's home doesn't declare or hold, such as a " +
    "model server or a sign-in, it takes from providers/ in your Shrimpy folder, which is ~/shrimpy or the " +
    "folder SHRIMPY_DIR names. SIGTERM or Ctrl+C stops it: it stops taking input, gives " +
    "running turns up to five seconds to finish, then closes, and work that did not finish resumes at the " +
    "next start. --now skips the wait, and so does a second signal during it.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { now: { type: "boolean" } }, allowPositionals: true }),
    );
    const [given] = expectArguments(positionals, ["<agent>"]);

    // Listening for stop requests comes first: whoever reads the "listening" line may signal at once.
    // The first request stops the agent, with a short wait for running turns unless --now is given.
    // A second request while it waits skips the wait.
    let agent: HomeAgent | undefined;
    let requests = 0;
    let firstRequest = (): void => undefined;
    const requested = new Promise<void>((resolveRequest) => {
      firstRequest = resolveRequest;
    });
    const stopListening = io.onStop(() => {
      requests += 1;
      if (requests === 1) firstRequest();
      else void agent?.close({ now: true });
    });
    try {
      agent = await startHomeAgent(homeNamed(given), { shrimpy: shrimpyCommand(), providers: providersPath() });
      io.out(JSON.stringify({ event: "listening", name: agent.name, home: agent.home, ...agent.endpoint }));
      await requested;
      await agent.close({ now: values.now === true });
      return 0;
    } finally {
      stopListening();
    }
  },
};

const status: Command = {
  name: "agent status",
  usage: "[--agent <agent>]",
  summary: "Say whether the agent is running, and how to reach it.",
  details: `Prints one JSON line. Exits 0 if an agent is running and 1 if not. ${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    expectArguments(positionals, []);
    const { home } = agentToActOn(values.agent);

    // The endpoint file outlives the agent, so only an answer shows that one is there.
    if (!(await answers(home))) {
      io.out(JSON.stringify({ running: false, home }));
      return 1;
    }
    io.out(JSON.stringify({ running: true, home, ...readEndpoint(home) }));
    return 0;
  },
};

/**
 * Whether an agent answers at `home`. Reaching an agent is never refused, so it
 * is asked for its sessions too, which an agent can refuse another agent's
 * command: a command run in the shell of another agent is told so, and not
 * that the agent is there.
 */
async function answers(home: string): Promise<boolean> {
  const connection = await connectIfRunning(home);
  if (connection === undefined) return false;
  try {
    await connection.sessions();
    return true;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

const context: Command = {
  name: "agent context",
  usage: "[--agent <agent>]",
  summary: "Preview what an agent would be told, from its home's files as they are now.",
  details:
    "Prints the sections the agent's instructions are made of, in order, as a model would get them. It " +
    "reads the files and starts nothing, so it also works while an agent runs there. A running agent looks " +
    "at its files every couple of seconds and reads them again when they change, so it has the same within a " +
    `few seconds of a change. ${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    expectArguments(positionals, []);
    const target = agentToActOn(values.agent);
    await mayActOn(target, "Looking at what another agent is told");
    const { home } = target;

    const { sections, leftOut, ...read } = await previewHomeContext(home);
    io.out(
      `Preview of what the agent would be told if it started now, from the files of ${home}. ` +
        `It would read ${whatItReads(read)}. A running agent reads the same within a few seconds of a change.\n`,
    );
    io.out(sections.map((section) => section.text).join("\n\n"));
    if (leftOut.length > 0) io.out(`\nLeft out:\n${leftOutLines(leftOut).join("\n")}`);
    return 0;
  },
};

export const agentCommands: Command[] = [init, join, serve, status, context];
