import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { asError } from "../../lib/errors/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { capitalize } from "../../lib/text/index.ts";
import { homeConfigFile } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd, type Ended } from "../programs/index.ts";
import { startAgent } from "./agents.ts";
import type { Held, Started } from "./launch.ts";
import { lengthOf, type Pace } from "./pace.ts";

/** `up` keeping the homes of the folder running. */
export interface Follower {
  /** Look at the folder once: keep each new home, start the agent of each that has none, and let go of each that is gone. Settles when the starts it began have. */
  look(): Promise<void>;
  /** Whether a home has no agent running, and is to be started again. */
  waiting(): boolean;
  /** Stop looking, and wait for the starts under way. What is running is left running, for `up` to stop. */
  close(): Promise<void>;
}

export interface FollowOptions {
  io: Io;
  /** What `up` started: an agent started at a home is in it while it runs, so that `up` stops it at the end. */
  crew: Started[];
  pace: Pace;
  /** The homes of the folder as they are now. It throws when the folder can't be read. */
  homes: () => string[];
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
  /** The home is no longer in the folder. A start that was under way when it went lets go of it when it ends. */
  gone?: true;
}

/** What following the folder keeps from one look to the next. */
interface Following extends FollowOptions {
  kept: Map<string, Kept>;
  /** The starts and stops under way, which closing waits for. */
  working: Set<Promise<void>>;
  closed: boolean;
  /** What the folder said when it last could not be read, so that it is said once. */
  unreadable: string | undefined;
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
export function follow(options: FollowOptions): Follower {
  const following: Following = { ...options, kept: new Map(), working: new Set(), closed: false, unreadable: undefined };
  const timer = setInterval(() => {
    look(following).catch((error: unknown) => options.io.err(asError(error).message));
  }, options.pace.lookMs);
  return {
    look: () => look(following),
    waiting: () => [...following.kept.values()].some((home) => home.agent === undefined && home.borrowed === undefined),
    async close() {
      following.closed = true;
      clearInterval(timer);
      await Promise.all([...following.working]);
    },
  };
}

async function look(following: Following): Promise<void> {
  const { io, kept, pace } = following;
  if (following.closed) return;
  let homes: string[];
  try {
    homes = following.homes();
    following.unreadable = undefined;
  } catch (error) {
    // A folder that can't be read for now leaves every agent as it is.
    const message = asError(error).message;
    if (message !== following.unreadable) io.err(message);
    following.unreadable = message;
    return;
  }
  for (const home of homes) {
    if (kept.has(home)) continue;
    const pauses = backoff({ firstMs: pace.pauseMs, maxMs: pace.longestPauseMs });
    kept.set(home, { home, busy: false, notBefore: 0, pauses });
  }
  for (const home of kept.values()) {
    if (!homes.includes(home.home)) void track(following, dropped(following, home));
  }
  await Promise.all([...kept.values()].map((home) => tend(following, home)));
}

/** Count `work` among what closing waits for. What goes wrong in it is said, and does not stop `up`. */
function track(following: Following, work: Promise<void>): Promise<void> {
  const done = work.catch((error: unknown) => {
    following.io.err(asError(error).message);
  });
  following.working.add(done);
  void done.then(() => following.working.delete(done));
  return done;
}

/** Start the agent of a home that has none running, when it is time to. */
function tend(following: Following, home: Kept): Promise<void> {
  if (following.closed || home.busy || home.agent !== undefined) return Promise.resolve();
  const config = configOf(home.home);
  const changed = home.config !== undefined && config !== undefined && config !== home.config;
  if (Date.now() < home.notBefore && !changed) return Promise.resolve();
  home.busy = true;
  return track(following, startThenLetGo(following, home, changed));
}

/** Start the agent of `home`, then, if the home went while it started, stop it, as if the home had gone afterwards. */
async function startThenLetGo(following: Following, home: Kept, changed: boolean): Promise<void> {
  try {
    await start(following, home, changed);
  } finally {
    home.busy = false;
  }
  if (home.gone === true) await letGo(following, home);
}

async function start(following: Following, home: Kept, changed: boolean): Promise<void> {
  const { io, crew } = following;
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
      (ended) => lost(following, home, agent, ended),
      () => undefined,
    );
  } catch (error) {
    failed(following, home, error, held);
  }
}

/** An agent this started has ended without being asked to. */
function lost(following: Following, home: Kept, agent: Started, ended: Ended): void {
  const { io, pace } = following;
  if (following.closed || home.agent !== agent) return;
  home.agent = undefined;
  leave(following, agent);
  if (Date.now() - (agent.startedAt ?? 0) >= pace.stableMs) home.pauses.reset();
  const pause = home.pauses.next();
  home.notBefore = Date.now() + pause;
  io.err(
    `${capitalize(agent.what)} (pid ${agent.program.pid}) ended by itself (${describeEnd(ended)}). ` +
      `It is started again after ${lengthOf(pause)}.`,
  );
}

/** A start that did not work. It is said unless it came to what the last one did, and the next is later. */
function failed(following: Following, home: Kept, error: unknown, held: Held): void {
  const { io } = following;
  const message = asError(error).message;
  const pause = home.pauses.next();
  home.notBefore = Date.now() + pause;
  const came = [message, ...held.map((each) => each.line)].join("\n");
  if (came === home.failure) return;
  home.failure = came;
  for (const { stream, line } of held) io[stream](`[agent ${basename(home.home)}] ${line}`);
  io.err(`${message} It is tried again after ${lengthOf(pause)}, then after longer pauses, and at once when its agent.json changes.`);
}

/** A home that is not in the folder any more: the agent this started there is stopped, once it has started if it is starting. */
async function dropped(following: Following, home: Kept): Promise<void> {
  following.kept.delete(home.home);
  home.gone = true;
  if (!home.busy) await letGo(following, home);
}

/** What is left of a home that is gone: the agent this started there is stopped. */
async function letGo(following: Following, home: Kept): Promise<void> {
  const { io } = following;
  const agent = home.agent;
  if (agent === undefined) {
    if (home.failure !== undefined) io.out(`The home at ${home.home} is gone, so its agent is not tried again.`);
    return;
  }
  home.agent = undefined;
  leave(following, agent);
  io.out(`The home at ${home.home} is gone, so ${agent.what} (pid ${agent.program.pid}) is stopped.`);
  const ended = await agent.program.stop();
  if (ended.code !== 0 || ended.signal !== null) {
    io.err(`${capitalize(agent.what)} ended with ${describeEnd(ended)} when it was stopped.`);
  }
}

function leave(following: Following, agent: Started): void {
  const at = following.crew.indexOf(agent);
  if (at !== -1) following.crew.splice(at, 1);
}

/** What agent.json of `home` says now, or undefined when it can't be read. */
function configOf(home: string): string | undefined {
  try {
    return readFileSync(homeConfigFile(home), "utf8");
  } catch {
    return undefined;
  }
}
