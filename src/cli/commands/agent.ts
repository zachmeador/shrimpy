import { basename } from "node:path";
import { parseArgs } from "node:util";
import {
  checkAgentName,
  type HomeAgent,
  initHome,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
  previewHomeContext,
  startHomeAgent,
} from "../../agent/index.ts";
import { readEndpoint } from "../../contracts/agent/node.ts";
import { homeNamed, isPath, newHome } from "../folder/index.ts";
import { shrimpyCommand } from "../programs/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { connectIfRunning, withConnection } from "./connected.ts";
import { leftOutLines, whatItReads } from "./reloaded.ts";
import { ABOUT_ANOTHER_AGENT, AGENT_OPTION, agentToActOn, mayActOn, WHICH_AGENT } from "./which-agent.ts";

const init: Command = {
  name: "agent init",
  usage: "<agent> --model <provider/id> [--name <name>]",
  summary: "Create an agent home. Files that already exist are left as they are.",
  details: "The agent is named for the folder of its home unless --name gives it another name.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { name: { type: "string" }, model: { type: "string" } },
        allowPositionals: true,
      }),
    );
    const [given] = expectArguments(positionals, ["<agent>"]);
    if (values.model === undefined) throw new UsageError("Missing --model.");
    const model = modelFromFlag(values.model);

    const home = newHome(given);
    const name = values.name ?? folderName(home);
    const { paths, created } = initHome(home, { name, model });
    if (created.length === 0) {
      io.out(`The agent ${name} is already set up in ${paths.root}. Nothing was changed.`);
      return 0;
    }
    // A home in the Shrimpy folder is found by its name, and one anywhere else by its path.
    const named = !isPath(given);
    io.out(`Created the agent ${name} in ${paths.root}, with the model ${modelLabel(model)}.`);
    io.out("");
    io.out("Next:");
    io.out(
      `  1. Give ${name} access to that model. Declare its provider in ${paths.models}, ` +
        `or add a key to ${paths.auth}.`,
    );
    io.out(`  2. Say who ${name} is in ${paths.soul}. It starts with a few plain defaults that work as they are.`);
    io.out("  3. Start it:");
    io.out(`       ${named ? "shrimpy up" : `shrimpy up ${paths.root}`}`);
    io.out("     Or, if Shrimpy is already running, add the agent to it:");
    io.out(`       shrimpy agent serve ${named ? given : paths.root}`);
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

const serve: Command = {
  name: "agent serve",
  usage: "<agent> [--now]",
  summary: "Run the agent in the foreground until it is told to stop.",
  details:
    "Prints one JSON line when it is listening. SIGTERM or Ctrl+C stops it: it stops taking input, gives " +
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
      agent = await startHomeAgent(homeNamed(given), { shrimpy: shrimpyCommand() });
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
    "reads the files and starts nothing, so it also works while an agent runs there. A running agent has " +
    `what it read when it started or last reloaded: make it read again with shrimpy agent reload. ${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    expectArguments(positionals, []);
    const target = agentToActOn(values.agent);
    await mayActOn(target, "Looking at what another agent is told");
    const { home } = target;

    const { sections, leftOut, ...read } = await previewHomeContext(home);
    io.out(
      `Preview of what the agent would be told if it started now, from the files of ${home}. ` +
        `It would read ${whatItReads(read)}. A running agent has what it read when it started or last reloaded.\n`,
    );
    io.out(sections.map((section) => section.text).join("\n\n"));
    if (leftOut.length > 0) io.out(`\nLeft out:\n${leftOutLines(leftOut).join("\n")}`);
    return 0;
  },
};

const reload: Command = {
  name: "agent reload",
  usage: "[--agent <agent>]",
  summary: "Make a running agent read its instructions, context files, skills and triggers again.",
  details:
    "An agent reads SOUL.md, the Markdown files in context/, the skills in skills/ and the triggers in " +
    "triggers/ when it starts, and editing them changes nothing for it until this is run. Each session then " +
    "uses what changed in its instructions with its next request, and what it already holds is not rewritten; " +
    "a trigger follows its file at once. A file the agent cannot use is left out and named, and the rest is " +
    `read. To see what a home gives an agent now, use shrimpy agent context. ${WHICH_AGENT} ` +
    ABOUT_ANOTHER_AGENT,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    expectArguments(positionals, []);
    const target = agentToActOn(values.agent);

    return withConnection(target, async (connection) => {
      const reloaded = await connection.reload();
      io.out(
        `Reloaded. The agent at ${target.home} now reads ${whatItReads(reloaded)}. ` +
          "Each of its sessions uses a change to its instructions with its next request; a trigger follows its file at once.",
      );
      if (reloaded.leftOut.length > 0) io.out(`Left out:\n${leftOutLines(reloaded.leftOut).join("\n")}`);
      return 0;
    });
  },
};

export const agentCommands: Command[] = [init, serve, status, reload, context];
