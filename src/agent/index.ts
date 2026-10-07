/**
 * The agent program: one process that owns one home, serves the agent API for
 * it on two sockets (the home's own, and the one the gateway pipes connections
 * made by its name to), and takes part in the network as a member and in chat.
 * Other programs reach an agent only through `contracts/agent`; they never
 * import this program's modules, except that the CLI starts an agent, creates a
 * home, previews what a home would tell an agent, reads, checks and
 * changes the files of its triggers and its wake file, and signs the folder its
 * agents are started in to a model provider, through this door, none
 * of which needs a running agent. It must not know who its clients are beyond who it is told
 * they are, or anything about the chat server and the gateway beyond their
 * contracts.
 */
import type { AgentEndpoint } from "../contracts/agent/index.ts";
import { readMembership } from "../contracts/agent/node.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import { createAdmissions } from "./chat/durable.ts";
import { channelOfThread, createDelivery, createWakes } from "./chat/index.ts";
import { homeContext } from "./context/durable.ts";
import { type ContextPreview, previewContext } from "./context/index.ts";
import {
  homePaths,
  type LeftOut,
  loadHome,
  readBreadcrumbs,
  readTriggers,
  readWake,
  type TriggerFiles,
  type WakeRead,
  writeBreadcrumb,
} from "./home/index.ts";
import { buildModels, type HostOptions, openHost } from "./host/durable.ts";
import { type Joined, join, type JoinOptions } from "./join.ts";
import { whoseTicket } from "./links/index.ts";
import { messageTools } from "./message-tools/durable.ts";
import { askTools, createQuestions } from "./questions/durable.ts";
import { openRecords, type SessionDefaults } from "./records/durable.ts";
import { type HomeFiles, startServer } from "./server.ts";
import { createSessions, stopWork } from "./sessions/durable.ts";
import { type CloseOptions, stopper } from "./stop.ts";
import { createTriggers } from "./triggers/durable.ts";
import { beginRun, createWorking, type Run, turnTask } from "./turns/durable.ts";
import { createWakeups, wakeupTools } from "./wakeups/durable.ts";

export { placeOfThread, type ThreadPlace } from "./chat/index.ts";
export type { ContextPreview } from "./context/index.ts";
export {
  checkAgentName,
  DEFAULT_WAKE_POLICY,
  describeSchedule,
  draftTrigger,
  type InitOptions,
  type InitResult,
  initHome,
  isWakePolicy,
  type ModelChoice,
  modelLabel,
  type NewTrigger,
  NoTriggerError,
  parseModelChoice,
  parseTrigger,
  parseWake,
  type ProviderPaths,
  providerPaths,
  readDefaultModel,
  removeTrigger,
  saveDefaultModel,
  saveTrigger,
  saveWake,
  switchTrigger,
  type TriggerDefinition,
  type TriggerDraft,
  TriggerFileError,
  type TriggerFiles,
  type TriggerProblem,
  WAKE_POLICIES,
  type WakePolicy,
  type WakeRead,
} from "./home/index.ts";
export {
  type Dialogue,
  type Notice,
  openSignIns,
  type ProviderToSignIn,
  type Question,
  type SignIns,
  type SignInWay,
  type WayToSignIn,
} from "./host/durable.ts";
export type { JoinOptions } from "./join.ts";
export type { CloseOptions } from "./stop.ts";

export interface AgentOptions extends HostOptions {
  /**
   * The agent's name: what it asks the roster to call it, and what its
   * instructions call it. The roster binds the name to the agent's ID, and
   * decides whether it is free.
   */
  name: string;
  /** The model every session uses. It is set again at every start. */
  model: SessionDefaults["model"];
  /** Take part in the network and in chat. Without it, nothing reaches the agent but clients that attach to its sessions. */
  join?: JoinOptions;
  /** The shortest a trigger may repeat at, in milliseconds. A minute, if not given. Tests shorten it. */
  shortestEveryMs?: number;
  /** The shortest the agent may wait for another agent's answer to a question, in milliseconds. A minute, if not given. Tests shorten it. */
  shortestWaitMs?: number;
}

export interface RunningAgent {
  readonly endpoint: AgentEndpoint;
  /**
   * Stop taking input, let running turns finish for a short while, then close.
   * Unfinished work resumes at the next start.
   */
  close(options?: CloseOptions): Promise<void>;
}

/** An agent started from its home. */
export interface HomeAgent extends RunningAgent {
  readonly name: string;
  /** The home's absolute path. */
  readonly home: string;
}

/**
 * Take ownership of a home and start serving it. The lock comes first. What the
 * home's files tell the agent is read before that, and read again only when
 * the agent is told to reload.
 */
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  // A runtime directory too long for a socket fails here, before the home is claimed.
  socketPathFor(options.home);
  socketPathFor(options.home, "gw");
  const context = await homeContext({ name: options.name, home: options.home });
  const report = reporter(options);
  const host = await openHost(options);
  let run: Run | undefined;
  try {
    for (const { file, reason } of context.report.leftOut) report(new Error(`${file} was left out: ${reason}.`));
    // What the agent posts under names of its own making carries what its records are called, and only the opened
    // storage can say that. So the tools and tasks that post are made once the records are open, and installed before
    // anything runs.
    const recordsId = await openRecords(host.harness, homePaths(options.home).database);
    // They are installed before the agent has a link to chat. The tools ask for the one it has when they run, and say
    // chat is unreachable if there is none; the tasks wait for the link `join` gives them.
    let joined: Joined | undefined;
    const messages = messageTools({
      recordsId,
      chat: () => joined?.chat(),
      gateway: () => joined?.gateway(),
      ...(options.join?.messageLimit === undefined ? {} : { messageLimit: options.join.messageLimit }),
    });
    const delivery = createDelivery({
      recordsId,
      onError: report,
      ...(options.join?.messageLimit === undefined ? {} : { messageLimit: options.join.messageLimit }),
      ...(options.join?.backoff === undefined ? {} : { backoff: options.join.backoff }),
    });
    const turn = turnTask({ delivery, onError: report });
    // Every input is taken up with the breadcrumbs that are new to its session, which are read before the commit that does it.
    const paths = homePaths(options.home);
    const breadcrumbs = () => readBreadcrumbs(paths);
    const wakeups = createWakeups(turn.task, { onError: report, breadcrumbs });
    // The delivery waits for chat as it must, so a question's time being up looks at chat through it.
    const questions = createQuestions(turn.task, { onError: report, breadcrumbs, looking: delivery });
    const asking = askTools({
      questions,
      recordsId,
      chat: () => joined?.chat(),
      gateway: () => joined?.gateway(),
      ...(options.shortestWaitMs === undefined ? {} : { shortestWaitMs: options.shortestWaitMs }),
    });
    const defaults: SessionDefaults = { model: options.model, cwd: host.home };
    const triggers = createTriggers(host.harness, {
      turn: turn.task,
      defaults,
      read: () =>
        readTriggers(paths, {
          ...(options.shortestEveryMs === undefined ? {} : { shortestEveryMs: options.shortestEveryMs }),
        }),
      // A thread with no session behind it gets one in the channel chat says it is in, over the link the agent has then.
      channelOf: (threadId, signal) => channelOfThread(() => joined?.chat(), threadId, signal),
      breadcrumbs,
      leaveBreadcrumb: (name, text) => writeBreadcrumb(paths, name, text),
      onError: report,
    });
    host.install(
      context.extension,
      messages,
      wakeupTools({ wakeups }),
      asking,
      turn.extension,
      wakeups.extension,
      questions.extension,
      triggers.extension,
    );
    const sessions = createSessions(host.harness, defaults);
    const admissions = createAdmissions(host.harness, defaults, turn.task, stopWork, breadcrumbs);
    const working = createWorking(host.harness);
    // What wakes the agent in each room is read from the home's wake file, at the start and on a reload. A file that
    // does not check out is left out and named, and the agent keeps what it last read.
    const wakes = createWakes();
    const readWakes = async (): Promise<LeftOut[]> => {
      const read = await readWake(homePaths(options.home));
      if (read.kind === "left out") return [read.leftOut];
      wakes.replace(read.settings);
      return [];
    };
    // Sessions from an earlier start follow the home as it is now, before any of their work resumes.
    await sessions.applyDefaults();
    // The records say the agent is running, and what the last run's end cost the turns it interrupted, before any of
    // them resumes: a turn that has crashed too often is stopped here and does not run again.
    run = await beginRun(host.harness);
    // The triggers follow the files of the home before any of their work resumes: a trigger whose schedule changed
    // while the agent was down is not woken by its old one.
    for (const { file, reason } of (await triggers.reload()).leftOut) report(new Error(`${file} was left out: ${reason}.`));
    for (const { file, reason } of await readWakes()) report(new Error(`${file} was left out: ${reason}.`));
    host.resume();
    // Reloading reads the instructions, context files and skills, the triggers and the wake file.
    const files: HomeFiles = {
      async reload() {
        const read = await context.reload();
        const followed = await triggers.reload();
        return { ...read, triggers: followed.count, leftOut: [...read.leftOut, ...followed.leftOut, ...(await readWakes())] };
      },
    };
    // The gateway is joined once the server is up, so a ticket is checked over the connection it keeps, when there is one.
    // The agent knows itself by the member ID its home keeps, which it writes as soon as the gateway says who it is, and
    // so before it registers: no ticket for the agent exists until then.
    const server = await startServer(host, sessions, triggers, files, {
      whose: (ticket) => whoseTicket(() => joined?.gateway(), ticket, () => readMembership(homePaths(options.home).root)?.memberId),
    });
    try {
      if (options.join !== undefined) {
        joined = join(
          {
            name: options.name,
            home: options.home,
            listening: { serverId: server.endpoint.serverId, socket: server.gatewaySocket },
            admissions: { ...admissions, wakes },
            working,
            delivery,
            onError: report,
          },
          options.join,
        );
      }
      return { endpoint: server.endpoint, close: stopper({ host, server, run, joined }) };
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch (error) {
    // A start that fails closes the engine in an orderly way too, once the records say it was running.
    await run?.stopped().catch(report);
    await host.close();
    throw error;
  }
}

/** Where problems with the gateway and chat go: they are told once each and the agent carries on. */
function reporter(options: AgentOptions): (error: Error) => void {
  return (error) => {
    if (options.onReport === undefined) console.error("[agent]", error.message);
    else options.onReport(error);
  };
}

/**
 * Start the agent that lives at `home`, and have it take part in chat as the
 * agent its `agent.json` names. Its name comes from that file, and so does its
 * model, if the file names one: otherwise it starts with the folder's default.
 * Its instructions come from the files of the home. Reading `agent.json` takes
 * no lock and changes nothing, so a home that does not load, or a model that
 * is missing or cannot be used, fails before the agent claims the home.
 * `shrimpy` is the program and arguments that run Shrimpy, which the agent's
 * shell finds as the `shrimpy` command. `providers` is the `providers/`
 * directory of the folder the agent is started in: what its home doesn't
 * declare or hold, such as a model server, a sign-in or the model to start
 * with, it takes from there. It is told where that is and never looks, so with
 * none the agent has only what its home holds.
 */
export async function startHomeAgent(
  home: string,
  options: { shrimpy?: readonly string[]; providers?: string } = {},
): Promise<HomeAgent> {
  const loaded = loadHome(home);
  const { models, model } = await buildModels({
    modelsFile: loaded.paths.models,
    authFile: loaded.paths.auth,
    configFile: loaded.paths.config,
    ...(options.providers === undefined ? {} : { providers: options.providers }),
    ...(loaded.model === undefined ? {} : { model: { provider: loaded.model.provider, modelId: loaded.model.id } }),
  });
  const agent = await startAgent({
    home: loaded.paths.root,
    name: loaded.name,
    models,
    model,
    join: {},
    ...(options.shrimpy === undefined ? {} : { shrimpy: options.shrimpy }),
  });
  return { ...agent, name: loaded.name, home: loaded.paths.root };
}

/** What a home would give an agent: what it would be told, and how many triggers it would run. */
export interface HomePreview extends ContextPreview {
  /** How many of the home's trigger files check out. */
  readonly triggers: number;
}

/**
 * What the agent whose home is `home` would be told if it started now, and how
 * many triggers it would have, read from the home's files without starting
 * anything and without a lock. A trigger file that does not check out is among
 * what is left out. An agent that is running has what it read when it started
 * or last reloaded.
 */
export async function previewHomeContext(home: string): Promise<HomePreview> {
  const loaded = loadHome(home);
  const preview = await previewContext({ name: loaded.name, home: loaded.paths.root });
  const { triggers, problems } = await readTriggers(loaded.paths);
  return {
    ...preview,
    triggers: triggers.length,
    leftOut: [...preview.leftOut, ...problems.map(({ file, reason }) => ({ file, reason }))],
  };
}

/**
 * What the wake file of the home of `home` chooses, for the rooms it names, or why
 * the file is left out, read without starting anything and without a lock. A
 * running agent has what it read when it started or last reloaded.
 */
export async function readHomeWake(home: string): Promise<WakeRead> {
  return readWake(loadHome(home).paths);
}

/**
 * The triggers the files of the home of `home` hold, and the files that do not
 * check out, read without starting anything and without a lock. This is what a
 * running agent would have after it reloaded; it has no times and no outcomes,
 * which only a running agent knows.
 */
export async function readHomeTriggers(home: string): Promise<TriggerFiles> {
  return readTriggers(loadHome(home).paths);
}
