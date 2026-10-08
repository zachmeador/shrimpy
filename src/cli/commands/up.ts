import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentNotRunningError, attachLocal, readEndpoint, readMembership } from "../../contracts/agent/node.ts";
import { type Address, formatAddress } from "../../contracts/gateway/index.ts";
import { keptListenAddresses } from "../../gateway/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { allHomes, dataFolder, folderPath, homeConfigFile, homeNamed, nothingToStart } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd, type Ended, type Program, ProgramEndedError, startProgram } from "../programs/index.ts";
import { askLocalGateway } from "../talk/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";

/** How `up` keeps a folder running when it is told no agents. A test gives it shorter times. */
export interface Pace {
  /** How often it looks at the homes of the folder. */
  lookMs: number;
  /** The pause before an agent that ended, or could not start, is started again. It doubles with each failure in a row. */
  pauseMs: number;
  /** The longest the pause grows to. */
  longestPauseMs: number;
  /** How long an agent has to stay up for the pause to start over at `pauseMs`. */
  stableMs: number;
}

const PACE: Pace = { lookMs: 2_000, pauseMs: 2_000, longestPauseMs: 300_000, stableMs: 60_000 };

/** A length of time as a person says it: "2 seconds", "a minute", "5 minutes". */
function lengthOf(ms: number): string {
  if (ms < 1_000) return `${String(Math.round(ms))} milliseconds`;
  const seconds = Math.round(ms / 1_000);
  if (seconds === 60) return "a minute";
  if (seconds < 120) return `${String(seconds)} ${seconds === 1 ? "second" : "seconds"}`;
  return `${String(Math.round(seconds / 60))} minutes`;
}

/** `shrimpy up`. A test makes it with a pace of its own. */
export function upCommand(pace: Pace = PACE): Command {
  return {
    name: "up",
    usage: "[<agent>...] [--data <dir>] [--listen <host:port>]...",
    summary: "Start what is missing on this machine and keep it running: the gateway, the chat server and your agents.",
    details: [
      "With no agents named, it starts every agent in your Shrimpy folder, which is ~/shrimpy or the folder " +
        "SHRIMPY_DIR names: each folder of agents/ that holds an agent.json. The gateway keeps its roster in " +
        "gateway/ and the chat server its store in chat/, in that folder or in the directory --data names, which " +
        "is made if it is missing. Each program runs as a process of its own, the same one that gateway serve, " +
        "chat serve and agent serve start. A gateway, chat server or agent that is already running is used as it " +
        `is, and left running when this stops. ${ABOUT_LISTEN} This passes --listen to the gateway it starts, and ` +
        "says where the gateway listens. A gateway that is already running is used as it is, so --listen can't " +
        "change it, and this says so. When it is told to listen, by --listen or by the addresses the gateway kept, " +
        "it starts the gateway and the chat server in a folder with no agents too, since agents elsewhere can join " +
        "it. When every agent it is to start belongs to a gateway elsewhere, because it joined one with shrimpy " +
        "agent join, this starts those agents and no gateway or chat server, unless it is told to listen: they are " +
        "talked to from the gateway's machine. With some agents that belong elsewhere and some that don't, it " +
        "starts the gateway and the chat server as usual, and all the agents. Ctrl+C or SIGTERM stops what this " +
        "started, agents first, and exits 0 once they have stopped; a second request tells the agents to stop " +
        "without waiting for running turns, and a third ends everything at once.",
      "With no agents named, it also keeps the folder running, which is what a service runs. Every " +
        `${lengthOf(pace.lookMs)} it looks at the homes in agents/ and starts the agent of any home that has ` +
        "none running, so an agent made while this runs starts by itself. An agent this started that ends by " +
        "itself is reported with how it ended, and is started again alone, after a pause that grows from " +
        `${lengthOf(pace.pauseMs)} to ${lengthOf(pace.longestPauseMs)} while it keeps failing and starts over once ` +
        `it has stayed up for ${lengthOf(pace.stableMs)}. A home whose agent can't start is reported once, with ` +
        "what the agent said, and tried again after the same pauses, and at once when its agent.json changes. An " +
        "agent that someone else started is used as it is, and this starts the home's agent when that one ends. " +
        "The agent this started at a home that is taken away is stopped. If the gateway or the chat server this " +
        "started ends by itself, this says which, stops the rest and exits 1, so whatever keeps this running " +
        "starts it all again.",
      "With agents named, it starts those and follows nothing: if one of them, or the gateway or the chat " +
        "server this started, ends by itself, this says which, stops the rest and exits 1.",
    ].join("\n\n"),
    async run(args, io) {
      const { values, positionals } = parsing(() =>
        parseArgs({ args, options: { data: { type: "string" }, ...LISTEN_OPTION }, allowPositionals: true }),
      );
      if (values.data === "") throw new UsageError("--data needs a directory.");
      const listen = listenAddresses(values.listen);
      const given = values.data === undefined ? undefined : resolve(values.data);
      const plan = planUp(positionals, given, listen, dataFolder);
      if (plan === undefined) throw nothingToStart();
      return bringUp(io, plan, pace);
    },
  };
}

/**
 * What `up` starts for the agents it is told to start, or every agent of the Shrimpy folder when it is told none,
 * the data directory it is given and the addresses it is told to listen on: undefined when there is nothing to
 * start. It only reads. `dataFolder` is where the gateway and the chat server keep their data when no directory
 * is given.
 */
export function planUp(
  named: string[],
  given: string | undefined,
  listen: Address[] | undefined,
  dataFolder: () => string,
): Plan | undefined {
  const homes = named.length === 0 ? allHomes() : named.map(homeNamed);
  // Nothing is made until there is something to start, so where the gateway keeps its data is only read.
  const told = listen !== undefined || keptListenAddresses(join(given ?? folderPath(), "gateway")).length > 0;
  if (homes.length === 0 && !told) return undefined;
  const follow = named.length === 0;
  // Agents that joined a gateway elsewhere have no use for one here, unless this is told to listen for others.
  const elsewhere = homes.flatMap((home) => readMembership(home)?.gateway ?? []);
  if (homes.length > 0 && elsewhere.length === homes.length && !told) {
    return { homes, here: undefined, elsewhere: distinct(elsewhere), follow };
  }
  return { homes, here: { data: given ?? dataFolder(), listen }, elsewhere: [], follow };
}

/** Whether everything `plan` starts is running already, so that another `up` would find nothing to start. */
export async function alreadyRunning(plan: Plan): Promise<boolean> {
  if (plan.here !== undefined) {
    const found = await askLocalGateway();
    if (found === undefined || !found.programs.some((program) => program.kind === "chat")) return false;
  }
  for (const home of plan.homes) {
    if ((await runningAgent(home)) === undefined) return false;
  }
  return true;
}

export interface Plan {
  homes: string[];
  /**
   * The gateway and the chat server this starts beside the agents: where they keep their data, each in a folder of
   * its own, and the addresses `--listen` gave the gateway, when it gave any. None when every agent belongs to a
   * gateway elsewhere, and nothing is told to listen.
   */
  here: { data: string; listen: Address[] | undefined } | undefined;
  /** The gateways the agents belong to, when they all belong to one elsewhere. */
  elsewhere: Address[];
  /** Whether no agents were named, so that this keeps running the homes of the Shrimpy folder and not only starts them. */
  follow: boolean;
}

/** The addresses with none twice. */
const distinct = (addresses: Address[]): Address[] => [
  ...new Map(addresses.map((address) => [formatAddress(address), address])).values(),
];

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
  /** When an agent started, in milliseconds since the epoch. */
  startedAt?: number;
}

async function bringUp(io: Io, plan: Plan, pace: Pace): Promise<number> {
  const crew: Started[] = [];
  const stop = watchForStop(io, crew);
  let failure: unknown;
  try {
    await keepUp(io, plan, crew, stop, pace);
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
 * programs it must keep ends: any of them when agents were named, and the
 * gateway or the chat server when it follows the folder, where an agent that
 * ends is started again. Whatever was started is in `crew` even when this
 * throws, so the caller can stop it.
 */
async function keepUp(io: Io, plan: Plan, crew: Started[], stop: StopWatch, pace: Pace): Promise<void> {
  let folder: Follower | undefined;
  try {
    await startMissing(io, plan, crew, stop);
    if (stop.requests() > 0) return;
    folder = plan.follow ? follow(io, crew, pace) : undefined;
    await folder?.look();
    if (stop.requests() > 0) return;
    if (crew.length === 0 && folder?.waiting() !== true) {
      io.out("Everything is already running.");
      return;
    }
    const agent = crew.find((member) => member.role === "agent")?.program.listening.name;
    io.out("Running. Press Ctrl+C to stop what this command started.");
    if (plan.here === undefined) {
      // There is no gateway here to ask, so these agents are talked to where the gateway is.
      const where = plan.elsewhere.map(formatAddress).join(" and ");
      io.out(
        plan.elsewhere.length === 1
          ? `These agents belong to the gateway at ${where}, so you talk to them from that gateway's machine.`
          : `These agents belong to the gateways at ${where}, so you talk to each from its gateway's machine.`,
      );
    } else {
      if (plan.homes.length > 0) io.out(`Talk to an agent with: shrimpy run ${agent ?? "<agent>"} "<text>"`);
      else io.out("Let an agent in from another machine or user with: shrimpy members invite <name>");
      io.out("See what is running with: shrimpy gateway status");
    }
    if (folder !== undefined) io.out("An agent made in your Shrimpy folder starts by itself, and one that stops is started again.");

    const ended = await Promise.race([
      stop.asked.then(() => undefined),
      ...crew
        .filter((member) => folder === undefined || member.role !== "agent")
        .map((member) => member.program.ended.then(() => member)),
    ]);
    if (ended !== undefined) {
      ended.endedByItself = true;
      const how = describeEnd(await ended.program.ended);
      throw new Error(`${capitalize(ended.what)} stopped by itself (${how}), so the rest was stopped.`);
    }
  } finally {
    await folder?.close();
  }
}

/**
 * Start the gateway and the chat server, whichever is not already running, and
 * the agents that were named. Agents that were not named are the folder's to
 * keep running, which comes after.
 */
async function startMissing(io: Io, plan: Plan, crew: Started[], stop: StopWatch): Promise<void> {
  if (plan.here === undefined) {
    io.out("Every agent here belongs to a gateway elsewhere, so no gateway or chat server is started on this machine.");
  } else {
    await startGatewayAndChat(io, plan.here, crew, stop);
    if (stop.requests() > 0) return;
  }
  if (plan.follow) return;

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

/** Start the gateway and the chat server, whichever is not already running, in that order. */
async function startGatewayAndChat(io: Io, here: NonNullable<Plan["here"]>, crew: Started[], stop: StopWatch): Promise<void> {
  const found = await askLocalGateway(stop.signal);
  if (found === undefined) {
    const data = join(here.data, "gateway");
    const listen = (here.listen ?? []).flatMap((address) => ["--listen", formatAddress(address)]);
    const program = await launch(io, { text: "gateway" }, "the gateway", ["gateway", "serve", "--data", data, ...listen]);
    crew.push({ role: "gateway", what: "the gateway", program });
    io.out(`Started the gateway (pid ${program.pid}), keeping its roster in ${data}.`);
    const { listen: listening = [], listenKept = null } = program.listening;
    if (listening.length > 0) io.out(listeningLine(listening, listenKept));
  } else {
    warnIfVersionDiffers(io, "the gateway", found.version);
    io.out("The gateway is already running; using it as it is.");
    if (here.listen !== undefined) io.err(cannotChangeListening(here.listen));
  }
  if (stop.requests() > 0) return;

  const chat = found?.programs.findLast((program) => program.kind === "chat");
  if (chat === undefined) {
    const program = await launch(io, { text: "chat" }, "the chat server", ["chat", "serve", join(here.data, "chat")]);
    crew.push({ role: "chat", what: "the chat server", program });
    io.out(`Started the chat server (pid ${program.pid}), keeping its data in ${join(here.data, "chat")}.`);
  } else {
    warnIfVersionDiffers(io, "the chat server", chat.version);
    io.out("The chat server is already running; using it as it is.");
  }
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

/** How the start of an agent went: it started, or one that someone else started is running there. */
interface AgentStart {
  started?: Started;
  /** The process ID of the agent that someone else started, which is used as it is. */
  running?: number;
  /** What to say of it. */
  line: string;
}

/**
 * Start the agent at `home`, unless one already is, and say which in a line. The
 * lines the agent prints while it starts are kept in `held` when it is given,
 * and are printed, as they would have been, only if the agent starts.
 */
async function startAgent(io: Io, home: string, held?: Held): Promise<AgentStart> {
  const running = await runningAgent(home);
  if (running !== undefined) {
    return { running, line: `The agent at ${home} is already running (pid ${running}); using it as it is.` };
  }
  // The agent's name is only known once it says it is listening.
  const label = { text: `agent ${basename(home)}` };
  const program = await launch(io, label, `the agent at ${home}`, ["agent", "serve", home], held);
  const name = program.listening.name ?? basename(home);
  label.text = `agent ${name}`;
  return {
    started: { role: "agent", what: `the agent ${name}`, program, startedAt: Date.now() },
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

/** Lines a program printed before it said it was listening, in the order it printed them. */
type Held = { stream: "out" | "err"; line: string }[];

/**
 * Start a program, passing on what it prints with its label in front, so that
 * the lines of different programs can be told apart. The label can be changed
 * while the program runs. What it prints before it says it is listening is kept
 * in `held` when that is given, and printed once it has: if it ends instead, the
 * caller says what became of it.
 */
async function launch(
  io: Io,
  label: { text: string },
  what: string,
  args: string[],
  held?: Held,
): Promise<Program<Listening>> {
  const show = (stream: "out" | "err", line: string): void => io[stream](`[${label.text}] ${line}`);
  let holding = held !== undefined;
  try {
    const program = await startProgram<Listening>(args, (stream, line) => {
      if (holding) held?.push({ stream, line });
      else show(stream, line);
    });
    holding = false;
    for (const { stream, line } of held ?? []) show(stream, line);
    return program;
  } catch (error) {
    if (error instanceof ProgramEndedError) {
      throw new Error(`Could not start ${what} (${describeEnd(error.ended)}).`, { cause: error });
    }
    throw error;
  }
}

/** What `up` knows about one home of the folder that it keeps an agent running at. */
interface Kept {
  home: string;
  /** The agent this started there, while it runs. */
  agent?: Started;
  /** The process ID of an agent that someone else started there, which is used as it is. */
  borrowed?: number;
  /** A start, or a look for an agent that runs, is under way. */
  busy: boolean;
  /** No start before this time, in milliseconds since the epoch. */
  notBefore: number;
  pauses: Backoff;
  /** What agent.json said when the agent was last started, to tell when it changes. */
  config?: string;
  /** What the last start that failed came to, so that the same failure is not said again. */
  failure?: string;
}

/** `up` keeping the homes of the folder running. */
interface Follower {
  /** Look at the folder once: keep each new home, start the agent of each that has none, and let go of each that is gone. Settles when the starts it began have. */
  look(): Promise<void>;
  /** Whether a home has no agent running, and is to be started again. */
  waiting(): boolean;
  /** Stop looking, and wait for the starts under way. What is running is left running, for `up` to stop. */
  close(): Promise<void>;
}

/** What agent.json of `home` says now, or undefined when it can't be read. */
function configOf(home: string): string | undefined {
  try {
    return readFileSync(homeConfigFile(home), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Keep an agent running at every home of the Shrimpy folder, looking at the
 * folder each `pace.lookMs`. A home that appears gets its agent. An agent this
 * started that ends by itself is started again alone, after a pause that grows
 * while it keeps failing. A home whose agent can't start is said once, whatever
 * it comes to, and tried again after the same pauses, and at once when its
 * agent.json changes. The agent of a home that is taken away is stopped. An
 * agent that someone else started is used as it is until it ends.
 */
function follow(io: Io, crew: Started[], pace: Pace): Follower {
  const kept = new Map<string, Kept>();
  const working = new Set<Promise<void>>();
  let closed = false;
  let unreadable: string | undefined;

  /** Count `work` among what `close` waits for. What goes wrong in it is said, and does not stop `up`. */
  const track = (work: Promise<void>): Promise<void> => {
    const done = work.catch((error: unknown) => {
      io.err(error instanceof Error ? error.message : String(error));
    });
    working.add(done);
    void done.then(() => working.delete(done));
    return done;
  };

  const leave = (agent: Started): void => {
    const at = crew.indexOf(agent);
    if (at !== -1) crew.splice(at, 1);
  };

  /** An agent this started has ended without being asked to. */
  const lost = (home: Kept, agent: Started, ended: Ended): void => {
    if (closed || home.agent !== agent) return;
    home.agent = undefined;
    leave(agent);
    if (Date.now() - (agent.startedAt ?? 0) >= pace.stableMs) home.pauses.reset();
    const pause = home.pauses.next();
    home.notBefore = Date.now() + pause;
    io.err(
      `${capitalize(agent.what)} (pid ${agent.program.pid}) ended by itself (${describeEnd(ended)}). ` +
        `It is started again after ${lengthOf(pause)}.`,
    );
  };

  /** A start that did not work. It is said unless it came to what the last one did, and the next is later. */
  const failed = (home: Kept, error: unknown, held: Held): void => {
    const message = error instanceof Error ? error.message : String(error);
    const pause = home.pauses.next();
    home.notBefore = Date.now() + pause;
    const came = [message, ...held.map((each) => each.line)].join("\n");
    if (came === home.failure) return;
    home.failure = came;
    for (const { stream, line } of held) io[stream](`[agent ${basename(home.home)}] ${line}`);
    io.err(`${message} It is tried again after ${lengthOf(pause)}, then after longer pauses, and at once when its agent.json changes.`);
  };

  const start = async (home: Kept, changed: boolean): Promise<void> => {
    if (changed) {
      io.out(`${homeConfigFile(home.home)} changed, so the agent there is started at once.`);
      home.failure = undefined;
    }
    home.config = configOf(home.home);
    const held: Held = [];
    try {
      const attempt = await startAgent(io, home.home, held);
      const agent = attempt.started;
      if (agent === undefined) {
        if (home.borrowed === undefined) io.out(attempt.line);
        home.borrowed = attempt.running;
        return;
      }
      home.borrowed = undefined;
      home.failure = undefined;
      home.agent = agent;
      crew.push(agent);
      io.out(attempt.line);
      void agent.program.ended.then(
        (ended) => lost(home, agent, ended),
        () => undefined,
      );
    } catch (error) {
      failed(home, error, held);
    }
  };

  /** Start the agent of a home that has none running, when it is time to. */
  const tend = (home: Kept): Promise<void> => {
    if (closed || home.busy || home.agent !== undefined) return Promise.resolve();
    const config = configOf(home.home);
    const changed = home.config !== undefined && config !== undefined && config !== home.config;
    if (Date.now() < home.notBefore && !changed) return Promise.resolve();
    home.busy = true;
    return track(
      start(home, changed).finally(() => {
        home.busy = false;
      }),
    );
  };

  /** A home that is not in the folder any more: the agent this started there is stopped. */
  const dropped = async (home: Kept): Promise<void> => {
    kept.delete(home.home);
    const agent = home.agent;
    if (agent === undefined) {
      if (home.failure !== undefined) io.out(`The home at ${home.home} is gone, so its agent is not tried again.`);
      return;
    }
    home.agent = undefined;
    leave(agent);
    io.out(`The home at ${home.home} is gone, so ${agent.what} (pid ${agent.program.pid}) is stopped.`);
    const ended = await agent.program.stop();
    if (ended.code !== 0 || ended.signal !== null) {
      io.err(`${capitalize(agent.what)} ended with ${describeEnd(ended)} when it was stopped.`);
    }
  };

  const look = async (): Promise<void> => {
    if (closed) return;
    let homes: string[];
    try {
      homes = allHomes();
      unreadable = undefined;
    } catch (error) {
      // A folder that can't be read for now leaves every agent as it is.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== unreadable) io.err(message);
      unreadable = message;
      return;
    }
    for (const home of homes) {
      if (kept.has(home)) continue;
      const pauses = backoff({ firstMs: pace.pauseMs, maxMs: pace.longestPauseMs });
      kept.set(home, { home, busy: false, notBefore: 0, pauses });
    }
    for (const home of kept.values()) {
      if (!homes.includes(home.home)) void track(dropped(home));
    }
    await Promise.all([...kept.values()].map(tend));
  };

  const timer = setInterval(() => {
    look().catch((error: unknown) => io.err(error instanceof Error ? error.message : String(error)));
  }, pace.lookMs);

  return {
    look,
    waiting: () => [...kept.values()].some((home) => home.agent === undefined && home.borrowed === undefined),
    async close() {
      closed = true;
      clearInterval(timer);
      await Promise.all([...working]);
    },
  };
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

export const upCommands: Command[] = [upCommand()];
