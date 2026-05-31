import type { Api, Model } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../app/index.js";
import {
  type ModelSelectionConfig,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  createGatewaySessionDescriptor,
  createLocalSessionDescriptor,
  formatMissingAgentModelMessage,
} from "../sessions/index.js";
import {
  findActiveSessionFile,
} from "../sessions/storage.js";
import {
  parseCommandArgs,
  printError,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy models [--json]
  shrimpy models resolve [--agent <id>] [--session <name>|--channel <name>] [--provider <p>] [--model <m>] [--json]`;

interface ModelRef {
  provider: string;
  id: string;
}

interface ResolvedSessionRef {
  label: string;
  kind: string;
  channel?: string;
  dir: string;
  restoreSavedModel: boolean;
}

interface ModelResolveView {
  agentId: string;
  configuredDefault: {
    source: "agent";
    model: ModelRef;
    usable: boolean;
  } | null;
  session: (ResolvedSessionRef & {
    recordedModel?: ModelRef;
    recordedModelUsable?: boolean;
  }) | null;
  effective: {
    source: "cli" | "session" | "agent" | "missing";
    model?: ModelRef;
  };
  problems: string[];
}

export const cmdModels: CommandHandler = async (argv, config) => {
  const sub = argv[0];
  if (sub === "resolve") {
    return cmdModelsResolve(argv.slice(1), config);
  }
  if (sub && sub !== "--json") {
    console.error(`unknown models subcommand: ${sub}\n\n${USAGE}`);
    return 2;
  }
  return cmdModelsList(argv, config);
};

async function cmdModelsList(argv: string[], config: ShrimpyConfig): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config);
  const bootstrap = await runtime.createBootstrap();
  const available = bootstrap.modelRegistry.getAvailable();
  const agentDefaults = runtime.resolved.agents.map((agent) => {
    const model = agent.model ? toModelRef(agent.model) : undefined;
    return {
      id: agent.id,
      model,
      usable: model ? Boolean(bootstrap.modelRegistry.find(model.provider, model.id)) : false,
    };
  });
  const problems = agentDefaults
    .filter((agent) => !agent.model)
    .map((agent) => formatMissingAgentModelMessage(agent.id));

  const view = {
    agentDefaults,
    providers: groupModelsByProvider(available),
    problems,
  };

  if (values.json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  console.log("Models");
  console.log("");
  console.log("Agent defaults");
  for (const agent of agentDefaults) {
    console.log(`  ${agent.id}: ${agent.model ? formatModelRef(agent.model) : "missing"}`);
  }
  console.log("");
  console.log("Available models");
  const providers = groupModelsByProvider(available);
  if (providers.length === 0) {
    console.log("  (none)");
  } else {
    for (const provider of providers) {
      console.log(`  ${provider.provider}`);
      for (const model of provider.models) {
        const usedBy = agentDefaults
          .filter((agent) =>
            agent.model?.provider === provider.provider && agent.model.id === model.id
          )
          .map((agent) => agent.id);
        console.log(`    - ${model.id}${usedBy.length ? `  used by: ${usedBy.join(", ")}` : ""}`);
      }
    }
  }
  if (problems.length > 0) {
    console.log("");
    console.log("Problems");
    for (const problem of problems) console.log(`  ${problem}`);
  }
  console.log("");
  console.log("Inspect");
  console.log("  shrimpy models resolve --agent <id> --session tui");
  console.log("  shrimpy models resolve --agent <id> --channel <name>");
  return 0;
}

async function cmdModelsResolve(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      session: { type: "string", short: "s" },
      channel: { type: "string", short: "c" },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: USAGE,
  });

  if (values.session && values.channel) {
    return printError("models resolve accepts either --session or --channel, not both");
  }

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(values.agent);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const bootstrap = await runtime.createBootstrap({ agentId: agent.id });
  const session = values.channel
    ? {
      label: values.channel,
      kind: "gateway",
      channel: values.channel,
      dir: createGatewaySessionDescriptor({
        workspacePath: agentPaths.root,
        agentId: agent.id,
        channel: values.channel,
      }).sessionDir,
      restoreSavedModel: false,
    }
    : values.session
      ? resolveSessionRef(agentPaths.root, agent.id, values.session)
      : null;

  const configuredDefault = agent.model
    ? {
      source: "agent" as const,
      model: toModelRef(agent.model),
      usable: Boolean(bootstrap.modelRegistry.find(agent.model.provider, agent.model.id)),
    }
    : null;
  const problems: string[] = [];
  if (!configuredDefault) {
    problems.push(formatMissingAgentModelMessage(agent.id));
  } else if (!configuredDefault.usable) {
    problems.push(`agent ${agent.id} default model not found: ${formatModelRef(configuredDefault.model)}`);
  }

  const sessionRecord = session && !values.provider && !values.model
    ? readRecordedSessionModel(session.dir, process.cwd())
    : undefined;
  const recordedModelUsable = sessionRecord
    ? Boolean(bootstrap.modelRegistry.find(sessionRecord.provider, sessionRecord.id))
    : undefined;
  if (sessionRecord && recordedModelUsable === false) {
    problems.push(`session recorded model not found: ${formatModelRef(sessionRecord)}`);
  }

  let effective: ModelResolveView["effective"] = { source: "missing" };
  try {
    if (values.provider || values.model) {
      const model = runtime.resolveModel(
        bootstrap,
        values.provider,
        values.model,
        undefined,
      );
      effective = model
        ? { source: "cli", model: toModelRef(model) }
        : { source: "missing" };
    } else if (sessionRecord && recordedModelUsable && session?.restoreSavedModel) {
      effective = { source: "session", model: sessionRecord };
    } else if (agent.model && configuredDefault?.usable) {
      effective = { source: "agent", model: toModelRef(agent.model) };
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }

  const view: ModelResolveView = {
    agentId: agent.id,
    configuredDefault,
    session: session
      ? {
        ...session,
        ...(sessionRecord ? { recordedModel: sessionRecord } : {}),
        ...(recordedModelUsable !== undefined ? { recordedModelUsable } : {}),
      }
      : null,
    effective,
    problems,
  };

  if (values.json) {
    console.log(JSON.stringify(view, null, 2));
    return view.effective.model ? 0 : 1;
  }

  console.log("Model Resolution");
  console.log("");
  console.log(`agent: ${view.agentId}`);
  console.log(`configured default: ${view.configuredDefault ? formatModelRef(view.configuredDefault.model) : "missing"}`);
  if (view.session) {
    console.log(`session: ${view.session.kind}:${view.session.label}`);
    console.log(`session dir: ${view.session.dir}`);
    console.log(`session restore: ${view.session.restoreSavedModel ? "yes" : "no"}`);
    if (view.session.recordedModel) {
      console.log(`recorded session model: ${formatModelRef(view.session.recordedModel)}`);
    }
  }
  console.log(`effective: ${view.effective.model ? `${formatModelRef(view.effective.model)} (${view.effective.source})` : "missing"}`);
  if (problems.length > 0) {
    console.log("");
    console.log("Problems");
    for (const problem of problems) console.log(`  ${problem}`);
  }

  return view.effective.model ? 0 : 1;
}

function resolveSessionRef(
  agentRoot: string,
  agentId: string,
  raw: string,
): ResolvedSessionRef {
  if (raw.startsWith("gateway:")) {
    const channel = raw.slice("gateway:".length);
    const descriptor = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId,
      channel,
    });
    return {
      label: channel,
      kind: "gateway",
      channel,
      dir: descriptor.sessionDir,
      restoreSavedModel: false,
    };
  }

  const descriptor = createLocalSessionDescriptor({
    workspacePath: agentRoot,
    agentId,
    label: raw,
    kind: raw,
    channel: raw,
  });
  return {
    label: raw,
    kind: raw,
    channel: raw,
    dir: descriptor.sessionDir,
    restoreSavedModel: raw === "tui" || raw === "run",
  };
}

function readRecordedSessionModel(sessionDir: string, cwd: string): ModelRef | undefined {
  const active = findActiveSessionFile(sessionDir);
  if (!active) return undefined;

  try {
    const manager = SessionManager.open(active, sessionDir, cwd);
    const model = manager.buildSessionContext().model;
    return model
      ? { provider: model.provider, id: model.modelId }
      : undefined;
  } catch {
    return undefined;
  }
}

function groupModelsByProvider(models: Array<Model<Api>>): Array<{
  provider: string;
  models: ModelRef[];
}> {
  const groups = new Map<string, ModelRef[]>();
  for (const model of models) {
    const group = groups.get(model.provider) ?? [];
    group.push(toModelRef(model));
    groups.set(model.provider, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, providerModels]) => ({
      provider,
      models: providerModels.sort((a, b) => a.id.localeCompare(b.id)),
    }));
}

function toModelRef(model: ModelSelectionConfig | Model<Api>): ModelRef {
  return {
    provider: model.provider,
    id: model.id,
  };
}

function formatModelRef(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}
