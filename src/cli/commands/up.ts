import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentNotRunningError, attachLocal, readEndpoint } from "../../contracts/agent/node.ts";
import type { Io } from "../io/index.ts";
import { describeEnd, type Program, ProgramEndedError, startProgram } from "../programs/index.ts";
import { askGateway } from "../talk/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";

const up: Command = {
  name: "up",
  usage: "<home>... --data <dir>",
  summary: "Start what is missing on this machine and keep it running: the gateway, the chat server and an agent per home.",
  details:
    "Each program runs as a process of its own, the same one that gateway serve, chat serve and agent serve " +
    "start, and the chat server keeps its store in the data directory, which is made if it is missing. A " +
    "gateway, chat server or agent that is already running is used as it is, and left running when this stops. " +
    "Ctrl+C or SIGTERM stops what this started, agents first, and exits 0 once they have stopped; a second " +
    "request tells the agents to stop without waiting for running turns, and a third ends everything at " +
    "once. If a program this started ends by itself, this says which, stops the rest and exits 1.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { data: { type: "string" } }, allowPositionals: true }),
    );
    if (values.data === undefined) throw new UsageError("Missing --data.");
    if (values.data === "") throw new UsageError("--data needs a directory.");
    return bringUp(io, { data: resolve(values.data), homes: positionals.map((home) => resolve(home)) });
  },
};

interface Plan {
  /** Where the chat server keeps its store. */
  data: string;
  homes: string[];
}

/** The line a program prints to say it is listening, as far as `up` reads it. */
interface Listening {
  pid: number;
  name?: string;
}

/** A program `up` started. */
interface Started {
  role: "gateway" | "chat" | "agent";
  /** What to call it in a sentence: "the chat server". */
  what: string;
  program: Program<Listening>;
  /** It ended without being asked to, which is why everything is being stopped. */
  endedByItself?: true;
}

async function bringUp(io: Io, plan: Plan): Promise<number> {
  const crew: Started[] = [];
  const stop = watchForStop(io, crew);
  let failure: unknown;
  try {
    await keepUp(io, plan, crew, stop);
  } catch (error) {
    failure = error;
  }
  const abnormal = await stopAll(io, crew, stop.requests() >= 3);
  stop.release();
  // A stop request is why an error that came with it, such as an abandoned lookup, happened.
  if (failure !== undefined && stop.requests() === 0) throw failure as Error;
  return abnormal ? 1 : 0;
}

/**
 * Start what is missing, and wait until `up` is asked to stop or one of the
 * programs it started ends. Whatever was started is in `crew` even when this
 * throws, so the caller can stop it.
 */
async function keepUp(io: Io, plan: Plan, crew: Started[], stop: StopWatch): Promise<void> {
  await startMissing(io, plan, crew, stop);
  if (stop.requests() > 0) return;
  if (crew.length === 0) {
    io.out("Everything is already running.");
    return;
  }
  const agent = crew.find((member) => member.role === "agent")?.program.listening.name;
  io.out("Running. Press Ctrl+C to stop what this command started.");
  io.out(`Talk to an agent with: shrimpy run ${agent ?? "<agent>"} "<text>"`);
  io.out("See what is running with: shrimpy gateway status");

  const ended = await Promise.race([
    stop.asked.then(() => undefined),
    ...crew.map((member) => member.program.ended.then(() => member)),
  ]);
  if (ended !== undefined) {
    ended.endedByItself = true;
    const how = describeEnd(await ended.program.ended);
    throw new Error(`${capitalize(ended.what)} stopped by itself (${how}), so the rest was stopped.`);
  }
}

/** Start the gateway, the chat server and the agents that are not already running, in that order. */
async function startMissing(io: Io, plan: Plan, crew: Started[], stop: StopWatch): Promise<void> {
  const found = await askGateway(stop.signal);
  if (found === undefined) {
    const program = await launch(io, { text: "gateway" }, "the gateway", ["gateway", "serve"]);
    crew.push({ role: "gateway", what: "the gateway", program });
    io.out(`Started the gateway (pid ${program.pid}).`);
  } else {
    warnIfVersionDiffers(io, "the gateway", found.version);
    io.out("The gateway is already running; using it as it is.");
  }
  if (stop.requests() > 0) return;

  const chat = found?.programs.findLast((program) => program.kind === "chat");
  if (chat === undefined) {
    const program = await launch(io, { text: "chat" }, "the chat server", ["chat", "serve", plan.data]);
    crew.push({ role: "chat", what: "the chat server", program });
    io.out(`Started the chat server (pid ${program.pid}), keeping its data in ${plan.data}.`);
  } else {
    warnIfVersionDiffers(io, "the chat server", chat.version);
    io.out(`The chat server is already running (pid ${chat.pid}); using it as it is.`);
  }
  if (stop.requests() > 0) return;

  const agents = await Promise.allSettled(plan.homes.map((home) => startAgent(io, home)));
  let failed: PromiseRejectedResult | undefined;
  for (const result of agents) {
    if (result.status === "rejected") {
      failed ??= result;
      continue;
    }
    if (result.value.started !== undefined) crew.push(result.value.started);
    io.out(result.value.line);
  }
  if (failed !== undefined) throw failed.reason;
}

/** Start the agent at `home`, unless one already is, and say which in a line. */
async function startAgent(io: Io, home: string): Promise<{ started?: Started; line: string }> {
  const running = await runningAgent(home);
  if (running !== undefined) {
    return { line: `The agent at ${home} is already running (pid ${running}); using it as it is.` };
  }
  // The agent's name is only known once it says it is listening.
  const label = { text: `agent ${basename(home)}` };
  const program = await launch(io, label, `the agent at ${home}`, ["agent", "serve", home]);
  const name = program.listening.name ?? basename(home);
  label.text = `agent ${name}`;
  return {
    started: { role: "agent", what: `the agent ${name}`, program },
    line: `Started the agent ${name} (pid ${program.pid}) from ${home}.`,
  };
}

/** The process ID of the agent that owns `home`, or undefined if none answers there. */
async function runningAgent(home: string): Promise<number | undefined> {
  const endpoint = readEndpoint(home);
  if (endpoint === undefined) return undefined;
  try {
    await (await attachLocal(home)).close();
    return endpoint.pid;
  } catch (error) {
    if (error instanceof AgentNotRunningError) return undefined;
    throw error;
  }
}

/**
 * Start a program, passing on what it prints with its label in front, so that
 * the lines of different programs can be told apart. The label can be changed
 * while the program runs.
 */
async function launch(
  io: Io,
  label: { text: string },
  what: string,
  args: string[],
): Promise<Program<Listening>> {
  try {
    return await startProgram<Listening>(args, (stream, line) => io[stream](`[${label.text}] ${line}`));
  } catch (error) {
    if (error instanceof ProgramEndedError) {
      throw new Error(`Could not start ${what} (${describeEnd(error.ended)}).`, { cause: error });
    }
    throw error;
  }
}

/** Stop requests: a count, a promise for the first, and a signal for the lookups that wait on them. */
interface StopWatch {
  /** Settles at the first request. */
  asked: Promise<void>;
  /** Aborted at the first request, to end a lookup that is waiting for a gateway that does not answer. */
  signal: AbortSignal;
  requests(): number;
  release(): void;
}

/**
 * Listen for stop requests before anything starts, since whoever reads the first
 * line may signal at once. The first request stops everything in order. A second
 * is a second SIGTERM for the agents, which tells each to stop without waiting
 * for its running turns. The gateway and the chat server get one SIGTERM, when
 * their turn comes: once they have closed nothing listens for another, and the
 * signal would end them instead of being ignored. A third request kills everything.
 */
function watchForStop(io: Io, crew: Started[]): StopWatch {
  const aborted = new AbortController();
  let count = 0;
  let wake = (): void => undefined;
  const asked = new Promise<void>((resolveAsked) => {
    wake = resolveAsked;
  });
  const release = io.onStop(() => {
    count += 1;
    aborted.abort();
    for (const member of crew) {
      if (count === 2 && member.role === "agent") member.program.signal("SIGTERM");
      if (count > 2) member.program.signal("SIGKILL");
    }
    wake();
  });
  return { asked, signal: aborted.signal, requests: () => count, release };
}

/**
 * Stop what was started, agents first and the gateway last, so that an agent
 * can finish what it is posting while chat is still there. True if a program
 * ended in a way a stop does not explain, unless it was ended by force.
 */
async function stopAll(io: Io, crew: Started[], forced: boolean): Promise<boolean> {
  if (crew.length === 0) return false;
  io.out("Stopping what this command started. Another Ctrl+C stops without waiting.");
  let abnormal = false;
  for (const role of ["agent", "chat", "gateway"] as const) {
    const these = crew.filter((member) => member.role === role);
    const endings = await Promise.all(these.map((member) => member.program.stop()));
    these.forEach((member, index) => {
      const ended = endings[index];
      const clean = ended === undefined || (ended.code === 0 && ended.signal === null);
      if (clean || forced || member.endedByItself === true) return;
      abnormal = true;
      io.err(`${capitalize(member.what)} ended with ${describeEnd(ended)} when it was stopped.`);
    });
  }
  io.out("Everything this command started has stopped.");
  return abnormal;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const upCommands: Command[] = [up];
