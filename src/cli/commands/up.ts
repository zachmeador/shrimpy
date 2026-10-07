import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentNotRunningError, attachLocal, readEndpoint } from "../../contracts/agent/node.ts";
import { type Address, formatAddress } from "../../contracts/gateway/index.ts";
import { keptListenAddresses } from "../../gateway/index.ts";
import { allHomes, dataFolder, folderPath, homeNamed, nothingToStart } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd, type Program, ProgramEndedError, startProgram } from "../programs/index.ts";
import { askGateway } from "../talk/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";

const up: Command = {
  name: "up",
  usage: "[<agent>...] [--data <dir>] [--listen <host:port>]...",
  summary: "Start what is missing on this machine and keep it running: the gateway, the chat server and your agents.",
  details:
    "With no agents named, it starts every agent in your Shrimpy folder, which is ~/shrimpy or the folder " +
    "SHRIMPY_DIR names: each folder of agents/ that holds an agent.json. The gateway keeps its roster in " +
    "gateway/ and the chat server its store in chat/, in that folder or in the directory --data names, which " +
    "is made if it is missing. Each program runs as a process of its own, the same one that gateway serve, " +
    "chat serve and agent serve start. A gateway, chat server or agent that is already running is used as it " +
    `is, and left running when this stops. ${ABOUT_LISTEN} This passes --listen to the gateway it starts, and ` +
    "says where the gateway listens. A gateway that is already running is used as it is, so --listen can't " +
    "change it, and this says so. When it is told to listen, by --listen or by the addresses the gateway kept, " +
    "it starts the gateway and the chat server in a folder with no agents too, since agents elsewhere can join " +
    "it. Ctrl+C or SIGTERM stops what this started, agents first, and " +
    "exits 0 once they have stopped; a second request tells the agents to stop without waiting for running " +
    "turns, and a third ends everything at once. If a program this started ends by itself, this says which, " +
    "stops the rest and exits 1.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { data: { type: "string" }, ...LISTEN_OPTION }, allowPositionals: true }),
    );
    if (values.data === "") throw new UsageError("--data needs a directory.");
    const listen = listenAddresses(values.listen);
    const homes = positionals.length === 0 ? allHomes() : positionals.map(homeNamed);
    // Nothing is made until there is something to start, so where the gateway keeps its data is only read.
    const given = values.data === undefined ? undefined : resolve(values.data);
    const told = listen !== undefined || keptListenAddresses(join(given ?? folderPath(), "gateway")).length > 0;
    if (homes.length === 0 && !told) throw nothingToStart();
    return bringUp(io, { data: given ?? dataFolder(), homes, listen });
  },
};

interface Plan {
  /** Where the gateway and the chat server keep their data, each in a folder of its own. */
  data: string;
  homes: string[];
  /** The addresses `--listen` gave the gateway, when it gave any. */
  listen: Address[] | undefined;
}

/** The line a program prints to say it is listening, as far as `up` reads it. */
interface Listening {
  pid: number;
  name?: string;
  /** The gateway's: the addresses it listens on for agents apart from it, and the file it read them from when it was given none. */
  listen?: Address[];
  listenKept?: string | null;
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
  if (plan.homes.length > 0) io.out(`Talk to an agent with: shrimpy run ${agent ?? "<agent>"} "<text>"`);
  else io.out("Let an agent in from another machine or user with: shrimpy members invite <name>");
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
    const data = join(plan.data, "gateway");
    const listen = (plan.listen ?? []).flatMap((address) => ["--listen", formatAddress(address)]);
    const program = await launch(io, { text: "gateway" }, "the gateway", ["gateway", "serve", "--data", data, ...listen]);
    crew.push({ role: "gateway", what: "the gateway", program });
    io.out(`Started the gateway (pid ${program.pid}), keeping its roster in ${data}.`);
    const { listen: listening = [], listenKept = null } = program.listening;
    if (listening.length > 0) io.out(listeningLine(listening, listenKept));
  } else {
    warnIfVersionDiffers(io, "the gateway", found.version);
    io.out("The gateway is already running; using it as it is.");
    if (plan.listen !== undefined) io.err(cannotChangeListening(plan.listen));
  }
  if (stop.requests() > 0) return;

  const chat = found?.programs.findLast((program) => program.kind === "chat");
  if (chat === undefined) {
    const program = await launch(io, { text: "chat" }, "the chat server", ["chat", "serve", join(plan.data, "chat")]);
    crew.push({ role: "chat", what: "the chat server", program });
    io.out(`Started the chat server (pid ${program.pid}), keeping its data in ${join(plan.data, "chat")}.`);
  } else {
    warnIfVersionDiffers(io, "the chat server", chat.version);
    io.out("The chat server is already running; using it as it is.");
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

/** Where the gateway it started listens for agents apart from it, and, when it was given no addresses, where it got them. */
function listeningLine(addresses: Address[], keptIn: string | null): string {
  const where = addresses.map(formatAddress).join(", ");
  return keptIn === null
    ? `The gateway listens for agents apart from it on ${where}, and keeps that for its next start.`
    : `The gateway listens for agents apart from it on ${where}, where it listened last time. ` +
        `That is kept in ${keptIn}: --listen replaces it, and deleting the file stops it.`;
}

/** What to tell someone who gave --listen to a gateway that is running already, which keeps the addresses it started with. */
function cannotChangeListening(addresses: Address[]): string {
  const listen = addresses.map((address) => `--listen ${formatAddress(address)}`).join(" ");
  return (
    `The gateway is already running, so ${listen} changes nothing: it listens where it was started. ` +
    `To make it listen there, stop it and run shrimpy up ${listen} again.`
  );
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
