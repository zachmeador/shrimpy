import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type HomeAgent,
  initHome,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
  startHomeAgent,
} from "../../agent/index.ts";
import { AgentNotRunningError, attachLocal, readEndpoint } from "../../contracts/agent/node.ts";
import { expectArguments, parsing, UsageError } from "../usage-error.ts";
import type { Command } from "./command.ts";

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

export const agentCommands: Command[] = [init, serve, status];
