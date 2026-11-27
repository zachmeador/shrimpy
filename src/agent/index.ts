import { type AgentEndpoint, type ModelId, removedAtStart } from "../contracts/agent/index.ts";
import { loadHome, NoTriggerError, readMembership, readTriggers, saveModel, switchTrigger, TriggerFileError } from "../contracts/agent/node.ts";
import { createLiveRoster } from "../contracts/gateway/index.ts";
import { asError } from "../lib/errors/index.ts";
import { followFiles } from "../lib/files/node.ts";
import { createListeners, untilHeard } from "../lib/listeners/index.ts";
import { isRefusal, refuse } from "../lib/refusal/index.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import { createAdmissions } from "./chat/durable.ts";
import { channelOfThread, createDelivery, createWakes } from "./chat/index.ts";
import { chatTools } from "./chat-tools/durable.ts";
import { homeContext } from "./context/durable.ts";
import { type ContextPreview, previewContext } from "./context/index.ts";
import { homeReader } from "./following.ts";
import { createHistory } from "./history/durable.ts";
import { homePaths, lookAtHome, readBreadcrumbs, workspaceCopier, writeBreadcrumb } from "./home/index.ts";
import { AGENT_STORAGE, buildModels, checkStorageVersion, type HostOptions, type ModelReload, openHost } from "./host/durable.ts";
import { type Joined, join, type JoinOptions } from "./join.ts";
import { followWorkspace, type LiveChat } from "./links/index.ts";
import { keepLook } from "./look.ts";
import { createProcesses } from "./processes/durable.ts";
import { DOCUMENTS, openRecords, type SessionDefaults } from "./records/durable.ts";
import { createRequests } from "./requests/durable.ts";
import { agentFacet } from "./served.ts";
import { startServer } from "./server.ts";
import { createSessions, requireModel, stopWork } from "./sessions/durable.ts";
import { type CloseOptions, stopper } from "./stop.ts";
import { createTriggers } from "./triggers/durable.ts";
import { createWorking, turnTask } from "./turns/durable.ts";
import { createWatches } from "./watches/durable.ts";

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
  name: string;
  model: SessionDefaults["model"];
  modelFromHome?: boolean;
  setModel?: (model: ModelId | null) => Promise<void>;
  reloadModels?: () => Promise<ModelReload>;
  modelFiles?: readonly string[];
  homeFile?: string;
  lookEveryMs?: number;
  join?: JoinOptions;
  /** The shortest a standing trigger may repeat at, in milliseconds. Tests shorten it. */
  shortestEveryMs?: number;
  /** Sync `bash` wait before auto-backgrounding, in milliseconds. Default 60s; tests shorten it. */
  syncWaitMs?: number;
  /** Built-in background process hang check-in delay, in milliseconds. Default 15m; tests shorten it. */
  checkinMs?: number;
}

export interface RunningAgent {
  readonly endpoint: AgentEndpoint;
  close(options?: CloseOptions): Promise<void>;
  readonly removed: Promise<void>;
}

export interface HomeAgent extends RunningAgent {
  readonly name: string;
  readonly home: string;
}

export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  socketPathFor(options.home);
  const paths = homePaths(options.home);
  const context = await homeContext({ name: options.name, home: options.home });
  const report = reporter(options);
  const host = await openHost(options);
  let following: { close(): Promise<void> } | undefined;
  let processesClose: (() => void) | undefined;
  try {
    const recordsId = await openRecords(host.harness, paths.database);
    let joined: Joined | undefined;
    let close: RunningAgent["close"] | undefined;
    let stoppedForRemoval = (): void => undefined;
    const removed = new Promise<void>((resolve) => {
      stoppedForRemoval = resolve;
    });
    const chat = () => joined?.chat();
    const chatUp = createListeners<LiveChat>(report);
    const untilChat = (signal: AbortSignal): Promise<LiveChat> => {
      const now = chat();
      return now === undefined ? untilHeard((heard) => chatUp.add(heard), signal) : Promise.resolve(now);
    };
    const roster = createLiveRoster(report);
    const members = () => roster.now()?.members;
    const breadcrumbs = () => readBreadcrumbs(paths);
    const messageLimit = options.join?.messageLimit === undefined ? {} : { messageLimit: options.join.messageLimit };
    const sessions = createSessions(host.harness, { model: options.model, cwd: host.home }, options.models, options.modelFromHome);
    const delivery = createDelivery({ recordsId, onError: report, ...messageLimit });
    const turn = turnTask({ delivery, onError: report });
    const watches = createWatches(host.harness);
    const processes = createProcesses(host.harness, {
      home: options.home,
      shellEnv: host.shellEnv,
      turn: turn.task,
      breadcrumbs,
      onError: report,
      ...(options.syncWaitMs === undefined ? {} : { syncWaitMs: options.syncWaitMs }),
      ...(options.checkinMs === undefined ? {} : { checkinMs: options.checkinMs }),
    });
    processesClose = () => processes.close();
    const triggerCheck = options.shortestEveryMs === undefined ? {} : { shortestEveryMs: options.shortestEveryMs };
    let reloadHome = async (): Promise<void> => undefined;
    const triggers = createTriggers(host.harness, {
      home: options.home,
      triggerCheck,
      turn: turn.task,
      defaults: sessions.defaults,
      read: () => readTriggers(paths, triggerCheck),
      onFilesChanged: () => reloadHome(),
      channelOf: (threadId, signal) => channelOfThread(untilChat, threadId, signal),
      breadcrumbs,
      leaveBreadcrumb: (name, text) => writeBreadcrumb(paths, name, text),
      onError: report,
    });
    const chatToolsOptions = { recordsId, chat, roster: members, ...messageLimit };
    const requests = createRequests(host.harness, {
      context,
      homeModel: () => ({ model: sessions.defaults.model, fromHome: sessions.fromHome() }),
    });
    const extensions = [
      context.extension,
      processes.extension,
      chatTools(chatToolsOptions, watches),
      createHistory(host.harness, chatToolsOptions),
      triggers.toolExtension,
      turn.extension,
      triggers.extension,
      // Installed last so `beforeRequest` captures final messages after every earlier hook (including `compactionNoteHook`).
      requests.extension,
    ];
    checkStorageVersion({ documents: DOCUMENTS, extensions }, AGENT_STORAGE);
    host.install(...extensions);
    const wakes = createWakes();
    const look = keepLook(report);
    const keeping = followFiles({
      ...(options.lookEveryMs === undefined ? {} : { everyMs: options.lookEveryMs }),
      look: () => lookAtHome(paths, options.modelFiles),
      read: homeReader({
        home: options.home,
        ...(options.homeFile === undefined ? {} : { homeFile: options.homeFile }),
        context,
        triggers,
        wakes,
        sessions,
        look,
        ...(options.reloadModels === undefined ? {} : { reloadModels: options.reloadModels }),
        report,
      }),
      onError: report,
    });
    reloadHome = async () => {
      await keeping.reload();
    };
    const copier = workspaceCopier(paths, { changed: () => keeping.reload(), onError: report });
    const keepingUp = {
      async close() {
        await copier.close();
        await keeping.close();
      },
    };
    following = keepingUp;
    await sessions.applyDefaults();
    await keeping.reload();
    host.resume();
    await processes.recover();

    let takingInput = true;
    const facet = agentFacet({
      sessions,
      requests,
      triggers,
      processes,
      watches,
      look,
      paths,
      reload: () => keeping.reload(),
      async setModel(model) {
        if (options.setModel === undefined) refuse("This agent's model is set where it was started, and can't be changed while it runs.");
        await options.setModel(model);
        return keeping.reload();
      },
      async switchTrigger(name, on) {
        try {
          await switchTrigger(options.home, name, on, triggerCheck);
        } catch (error) {
          refuse(switchRefused(name, error));
        }
        await keeping.reload();
        const now = (await triggers.list()).find((each) => each.name === name);
        if (now === undefined) refuse(`The agent has no trigger called ${name} after reading its files again.`);
        return now;
      },
      roster,
      takingInput: () => takingInput,
    });
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
            workspace: followWorkspace((files) => copier.copy(files)),
            admissions,
            wakes,
            working: createWorking(host.harness),
            delivery,
            ...(options.shrimpy === undefined ? {} : { shrimpy: options.shrimpy }),
            onRemoved() {
              void (close?.({ now: true }) ?? Promise.resolve())
                .catch((error: unknown) => report(asError(error)))
                .finally(stoppedForRemoval);
            },
            onError: report,
          },
          options.join,
        );
        joined.onChat((live) => chatUp.notify(live));
      }
      const refuseInput = (): void => {
        takingInput = false;
      };
      close = stopper({ host, server, joined, following: keepingUp, processes, refuseInput });
      return { endpoint: server.endpoint, close, removed };
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch (error) {
    processesClose?.();
    await following?.close();
    await host.close();
    throw error;
  }
}

function reporter(options: AgentOptions): (error: Error) => void {
  return (error) => {
    if (options.onReport === undefined) console.error(error.message);
    else options.onReport(error);
  };
}

export async function startHomeAgent(
  home: string,
  options: { shrimpy?: readonly string[]; providers?: string; lookEveryMs?: number } = {},
): Promise<HomeAgent> {
  const loaded = loadHome(home);
  const membership = readMembership(loaded.paths.root);
  if (membership?.removed !== undefined) {
    throw new Error(removedAtStart(loaded.name, loaded.paths.member, membership.removed, membership.gateway !== undefined));
  }
  const runtime = await buildModels({
    modelsFile: loaded.paths.models,
    authFile: loaded.paths.auth,
    configFile: loaded.paths.config,
    ...(options.providers === undefined ? {} : { providers: options.providers }),
    named: () => {
      const model = loadHome(loaded.paths.root).model;
      return model === undefined ? undefined : { provider: model.provider, modelId: model.id };
    },
  });
  const gateway = membership?.gateway;
  const agent = await startAgent({
    home: loaded.paths.root,
    name: loaded.name,
    models: runtime.models,
    model: runtime.model,
    modelFromHome: runtime.fromHome,
    async setModel(model) {
      try {
        const wanted = model === null ? runtime.folderDefault() : { provider: model.provider, modelId: model.id };
        if (wanted === undefined) refuse(NO_FOLDER_DEFAULT);
        await requireModel(runtime.models, wanted);
        saveModel(loaded.paths.root, model);
      } catch (error) {
        if (isRefusal(error)) throw error;
        refuse(`Nothing was changed: ${asError(error).message}`);
      }
    },
    reloadModels: () => runtime.reload(),
    modelFiles: runtime.files,
    homeFile: loaded.paths.config,
    join: gateway === undefined ? {} : { apart: gateway },
    ...(options.shrimpy === undefined ? {} : { shrimpy: options.shrimpy }),
    ...(options.lookEveryMs === undefined ? {} : { lookEveryMs: options.lookEveryMs }),
  });
  return { ...agent, name: loaded.name, home: loaded.paths.root };
}

function switchRefused(name: string, error: unknown): string {
  if (error instanceof NoTriggerError) {
    const known = error.known.length === 0 ? "It has none." : `Its triggers are: ${error.known.join(", ")}.`;
    return `${error.message} ${known}`;
  }
  if (error instanceof TriggerFileError) return `triggers/${name}.md was not changed: ${error.message}.`;
  return `Nothing was changed: ${asError(error).message}`;
}

const NO_FOLDER_DEFAULT =
  "Nothing was changed: without a model in agent.json the agent would follow the folder's default model, and the folder has none.";

export interface HomePreview extends ContextPreview {
  readonly triggers: number;
}

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
