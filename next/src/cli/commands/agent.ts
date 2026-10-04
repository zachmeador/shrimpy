import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type HomeAgent,
  initHome,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
  previewHomeContext,
  startHomeAgent,
} from "../../agent/index.ts";
import type { Reloaded } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, attachLocal, readEndpoint } from "../../contracts/agent/node.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { withConnection } from "./connected.ts";

const init: Command = {
  name: "agent init",
  usage: "<home> --name <name> --model <provider/id>",
  summary: "Create an agent home. Files that already exist are left as they are.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { name: { type: "string" }, model: { type: "string" } },
        allowPositionals: true,
      }),
    );
    const [home] = expectArguments(positionals, ["<home>"]);
    if (values.name === undefined) throw new UsageError("Missing --name.");
    if (values.model === undefined) throw new UsageError("Missing --model.");
    const model = modelFromFlag(values.model);

    const { paths, created } = initHome(resolve(home), { name: values.name, model });
    if (created.length === 0) {
      io.out(`The agent ${values.name} is already set up in ${paths.root}. Nothing was changed.`);
      return 0;
    }
    io.out(`Created the agent ${values.name} in ${paths.root}, with the model ${modelLabel(model)}.`);
    io.out(
      "Give it access to that model by declaring its provider in " +
        `${paths.models} or adding a key to ${paths.auth}. Then run:`,
    );
    io.out(`  shrimpy agent serve ${paths.root}`);
    return 0;
  },
};

function modelFromFlag(flag: string): ModelChoice {
  try {
    return parseModelChoice(flag);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

const serve: Command = {
  name: "agent serve",
  usage: "<home> [--now]",
  summary: "Run the agent in the foreground until it is told to stop.",
  details:
    "Prints one JSON line when it is listening. SIGTERM or Ctrl+C stops it: it stops taking input, gives " +
    "running turns up to five seconds to finish, then closes, and work that did not finish resumes at the " +
    "next start. --now skips the wait, and so does a second signal during it.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { now: { type: "boolean" } }, allowPositionals: true }),
    );
    const [home] = expectArguments(positionals, ["<home>"]);

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
      agent = await startHomeAgent(resolve(home));
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
  usage: "<home>",
  summary: "Say whether an agent is running at the home, and how to reach it.",
  details: "Prints one JSON line. Exits 0 if an agent is running and 1 if not.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [given] = expectArguments(positionals, ["<home>"]);
    const home = resolve(given);

    const endpoint = readEndpoint(home);
    // The endpoint file outlives the agent, so only an answer shows that one is there.
    if (endpoint === undefined || !(await answers(home))) {
      io.out(JSON.stringify({ running: false, home }));
      return 1;
    }
    io.out(JSON.stringify({ running: true, home, ...endpoint }));
    return 0;
  },
};

async function answers(home: string): Promise<boolean> {
  try {
    const connection = await attachLocal(home);
    await connection.close();
    return true;
  } catch (error) {
    if (error instanceof AgentNotRunningError) return false;
    throw error;
  }
}

const context: Command = {
  name: "agent context",
  usage: "<home>",
  summary: "Preview what the agent at a home would be told, from the home's files as they are now.",
  details:
    "Prints the sections the agent's instructions are made of, in order, as a model would get them. It " +
    "reads the files and starts nothing, so it also works while an agent runs there. A running agent has " +
    "what it read when it started or last reloaded: make it read again with shrimpy agent reload.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [given] = expectArguments(positionals, ["<home>"]);
    const home = resolve(given);

    const { sections, leftOut } = await previewHomeContext(home);
    io.out(
      `Preview of what the agent would be told if it started now, from the files of ${home}. ` +
        `A running agent has what it read when it started or last reloaded.\n`,
    );
    io.out(sections.map((section) => section.text).join("\n\n"));
    if (leftOut.length > 0) {
      io.out(`\nLeft out:\n${leftOut.map((each) => `  ${each.file}: ${each.reason}`).join("\n")}`);
    }
    return 0;
  },
};

const reload: Command = {
  name: "agent reload",
  usage: "<home>",
  summary: "Make the agent running at a home read its instructions, context files and skills again.",
  details:
    "An agent reads SOUL.md, the Markdown files in context/ and the skills in skills/ when it starts, and " +
    "editing them changes nothing for it until this is run. Each session then uses what changed with its " +
    "next request, and what it already holds is not rewritten. A file the agent cannot use is left out and " +
    "named, and the rest is read. To see what a home gives an agent now, use shrimpy agent context.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [given] = expectArguments(positionals, ["<home>"]);
    const home = resolve(given);

    return withConnection(home, async (connection) => {
      const reloaded = await connection.reload();
      io.out(
        `Reloaded. The agent at ${home} now reads ${whatItReads(reloaded)}. ` +
          "Each of its sessions uses the change with its next request.",
      );
      if (reloaded.leftOut.length > 0) {
        io.out(`Left out:\n${reloaded.leftOut.map((each) => `  ${each.file}: ${each.reason}`).join("\n")}`);
      }
      return 0;
    });
  },
};

/** What a reload found, such as "SOUL.md, 2 context files and 1 skill". */
function whatItReads({ soul, files, skills }: Reloaded): string {
  const parts = [
    ...(soul ? ["SOUL.md"] : []),
    ...(files > 0 ? [`${files} context ${files === 1 ? "file" : "files"}`] : []),
    ...(skills > 0 ? [`${skills} ${skills === 1 ? "skill" : "skills"}`] : []),
  ];
  const last = parts.pop();
  if (last === undefined) return "nothing from its home's files";
  return parts.length === 0 ? last : `${parts.join(", ")} and ${last}`;
}

export const agentCommands: Command[] = [init, serve, status, reload, context];
