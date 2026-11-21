/**
 * The agent program: one process that owns one home and serves the agent's
 * contract for it at `agent({ id })` over its link to the gateway (which relays
 * every request for it stamped with who asks) and at `agent({ id: HOME_AGENT })`
 * on the home's own socket, where a client is `home`. Over its gateway link it
 * takes part in the network as a member and in chat.
 * Other programs reach an agent only through `contracts/agent`; they never
 * import this program's modules, except that the CLI starts an agent, previews
 * what a home would tell an agent, and signs the folder its agents are started
 * in to a model provider, through this door. It must not know who its clients
 * are beyond who it is told they are, or anything about the chat server and the
 * gateway beyond their contracts.
 */
import type { AgentEndpoint, Reloaded } from "../contracts/agent/index.ts";
import { loadHome, readMembership, readTriggers } from "../contracts/agent/node.ts";
import { createLiveRoster } from "../contracts/gateway/index.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import { createAdmissions } from "./chat/durable.ts";
import { channelOfThread, createDelivery, createWakes } from "./chat/index.ts";
import { homeContext } from "./context/durable.ts";
import { type ContextPreview, previewContext } from "./context/index.ts";
import { type Following, follow, homeReader, LOOK_EVERY_MS } from "./following.ts";
import { homePaths, lookAtHome, readBreadcrumbs, writeBreadcrumb } from "./home/index.ts";
import { buildModels, type HostOptions, type ModelReload, openHost } from "./host/durable.ts";
import { type Joined, join, type JoinOptions } from "./join.ts";
import { messageTools } from "./message-tools/durable.ts";
import { askTools, createQuestions } from "./questions/durable.ts";
import { openRecords, type SessionDefaults } from "./records/durable.ts";
import { agentFacet } from "./served.ts";
import { startServer } from "./server.ts";
import { createSessions, requireModel, stopWork } from "./sessions/durable.ts";
import { type CloseOptions, stopper } from "./stop.ts";
import { createTriggers } from "./triggers/durable.ts";
import { createWorking, turnTask } from "./turns/durable.ts";
import { createWakeups, wakeupTools } from "./wakeups/durable.ts";

export type { ContextPreview } from "./context/index.ts";
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
  /** The model every session follows, which is the home's. It is set again at every start, and a reload can change it. */
  model: SessionDefaults["model"];
  /**
   * Read again the model the home starts with and the model servers its files
   * declare, for a reload. Without it a reload leaves both as they are.
   */
  reloadModels?: () => Promise<ModelReload>;
  /** The files `reloadModels` reads. The agent looks at them with its own, to know when to call it. */
  modelFiles?: readonly string[];
  /**
   * The file that makes the folder a home, such as the `agent.json` of a home the agent was started from. While it
   * can't be seen, as when the share the home is on is not mounted for a moment, nothing is read: a reading fails with
   * a sentence that says so, the agent keeps what it has, and the next look tries again. Without it a reading is made
   * of whatever is there.
   */
  homeFile?: string;
  /**
   * How often the agent looks at its files, in milliseconds, to read again what
   * changed. Two seconds, if not given. Tests shorten it.
   */
  lookEveryMs?: number;
  /** Take part in the network and in chat. Without it, nothing reaches the agent but clients on the home's own socket. */
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
 * home's files tell the agent is read at the start, and again whenever they
 * change: the agent looks at them every couple of seconds, and nobody has to tell
 * it to.
 */
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  // A runtime directory too long for a socket fails here, before the home is claimed.
  socketPathFor(options.home);
  const paths = homePaths(options.home);
  const context = await homeContext({ name: options.name, home: options.home });
  const report = reporter(options);
  const host = await openHost(options);
  let following: Following<Reloaded> | undefined;
  try {
    // What the agent posts under names of its own making carries what its records are called, which only the opened
    // storage can say, so what posts is made now, and installed before anything runs.
    const recordsId = await openRecords(host.harness, paths.database);
    // The tools ask for the link to chat when they run, and say chat is unreachable without one. The tasks wait for the
    // link `join` gives them.
    let joined: Joined | undefined;
    const chat = () => joined?.chat();
    const roster = createLiveRoster(report);
    const members = () => roster.now()?.members;
    const breadcrumbs = () => readBreadcrumbs(paths);
    const messageLimit = options.join?.messageLimit === undefined ? {} : { messageLimit: options.join.messageLimit };
    const sessions = createSessions(host.harness, { model: options.model, cwd: host.home }, options.models);
    const delivery = createDelivery({
      recordsId,
      onError: report,
      ...messageLimit,
      ...(options.join?.backoff === undefined ? {} : { backoff: options.join.backoff }),
    });
    const turn = turnTask({ delivery, onError: report });
    const wakeups = createWakeups(turn.task, { onError: report, breadcrumbs });
    // The delivery waits for chat as it must, so a question whose time is up looks at chat through it.
    const questions = createQuestions(turn.task, { onError: report, breadcrumbs, looking: delivery });
    const triggers = createTriggers(host.harness, {
      turn: turn.task,
      defaults: sessions.defaults,
      read: () => readTriggers(paths, options.shortestEveryMs === undefined ? {} : { shortestEveryMs: options.shortestEveryMs }),
      channelOf: (threadId, signal) => channelOfThread(chat, threadId, signal),
      breadcrumbs,
      leaveBreadcrumb: (name, text) => writeBreadcrumb(paths, name, text),
      onError: report,
    });
    host.install(
      context.extension,
      messageTools({ recordsId, chat, roster: members, ...messageLimit }),
      wakeupTools({ wakeups }),
      askTools({
        questions,
        recordsId,
        chat,
        roster: members,
        ...(options.shortestWaitMs === undefined ? {} : { shortestWaitMs: options.shortestWaitMs }),
      }),
      turn.extension,
      wakeups.extension,
      questions.extension,
      triggers.extension,
    );
    const wakes = createWakes();
    const keeping = follow({
      everyMs: options.lookEveryMs ?? LOOK_EVERY_MS,
      look: () => lookAtHome(paths, options.modelFiles),
      read: homeReader({
        home: options.home,
        ...(options.homeFile === undefined ? {} : { homeFile: options.homeFile }),
        context,
        triggers,
        wakes,
        sessions,
        ...(options.reloadModels === undefined ? {} : { reloadModels: options.reloadModels }),
        report,
      }),
      onError: report,
    });
    following = keeping;
    // Sessions from an earlier start follow the home as it is now, and the home is read, before any of their work
    // resumes: a trigger whose schedule changed while the agent was down is not woken by its old one.
    await sessions.applyDefaults();
    await keeping.reload();
    host.resume();
    // The agent's objects are served on the home's socket at once, and through the gateway once it links there. They
    // take new work until the agent begins to stop.
    let takingInput = true;
    const facet = agentFacet({ sessions, triggers, reload: () => keeping.reload(), roster, takingInput: () => takingInput });
    const server = await startServer({
      home: options.home,
      name: options.name,
      facet,
      onError: report,
    });
    try {
      if (options.join !== undefined) {
        const admissions = createAdmissions(
          host.harness,
          sessions.defaults,
          turn.task,
          { stopWork, requireModel: (model) => requireModel(options.models, model) },
          breadcrumbs,
        );
        joined = join(
          {
            name: options.name,
            home: options.home,
            facet,
            roster,
            admissions,
            wakes,
            working: createWorking(host.harness),
            delivery,
            onError: report,
          },
          options.join,
        );
      }
      const refuseInput = (): void => {
        takingInput = false;
      };
      return { endpoint: server.endpoint, close: stopper({ host, server, joined, following: keeping, refuseInput }) };
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch (error) {
    // A start that fails closes the engine in an orderly way too.
    await following?.close();
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
 * The agent reads that model, and the model servers, again whenever the files
 * that name them change. Its instructions come from the files of the home, and
 * it reads them again whenever they change. A home that names a gateway address in its
 * membership, as one does that joined from apart, links to the gateway there,
 * with its token, and reaches chat through it. Reading `agent.json` takes no lock and changes
 * nothing, so a home that does not load, or a model that is missing or cannot
 * be used, fails before the agent claims the home. `shrimpy` is the program and arguments that run Shrimpy, which the agent's
 * shell finds as the `shrimpy` command. `providers` is the `providers/`
 * directory of the folder the agent is started in: what its home doesn't
 * declare or hold, such as a model server, a sign-in or the model to start
 * with, it takes from there. It is told where that is and never looks, so with
 * none the agent has only what its home holds.
 */
export async function startHomeAgent(
  home: string,
  options: { shrimpy?: readonly string[]; providers?: string; lookEveryMs?: number } = {},
): Promise<HomeAgent> {
  const loaded = loadHome(home);
  const runtime = await buildModels({
    modelsFile: loaded.paths.models,
    authFile: loaded.paths.auth,
    configFile: loaded.paths.config,
    ...(options.providers === undefined ? {} : { providers: options.providers }),
    // Asked again whenever the agent reads the model again, so a change to the file is seen.
    named: () => {
      const model = loadHome(loaded.paths.root).model;
      return model === undefined ? undefined : { provider: model.provider, modelId: model.id };
    },
  });
  const gateway = readMembership(loaded.paths.root)?.gateway;
  const agent = await startAgent({
    home: loaded.paths.root,
    name: loaded.name,
    models: runtime.models,
    model: runtime.model,
    reloadModels: () => runtime.reload(),
    modelFiles: runtime.files,
    homeFile: loaded.paths.config,
    join: gateway === undefined ? {} : { apart: gateway },
    ...(options.shrimpy === undefined ? {} : { shrimpy: options.shrimpy }),
    ...(options.lookEveryMs === undefined ? {} : { lookEveryMs: options.lookEveryMs }),
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
 * what is left out. An agent that is running reads the same files by itself,
 * within a few seconds of a change.
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
