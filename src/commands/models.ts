import type { Api, Model } from "@earendil-works/pi-ai";
import { createAppRuntime } from "../app/runtime.js";
import { DEFAULT_MODEL_POLICY, formatModelRef, parseModelRef, sameModelRef, toModelRef, type ModelRef, type ModelPoliciesConfig, type ModelSelectionConfig } from "../config/model.js";
import {
  editModelPolicies,
  parseModelPolicyIndex,
  requireModelPolicy,
  uniqueModelCandidates,
} from "../config/model-policies.js";
import type { ShrimpyConfig } from "../config/load.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import { formatSessionId, parseSessionId, sessionRootPath } from "../sessions/identity.js";
import { resolveModelPolicy, resolveSessionModel, shouldRestoreSavedSessionModel } from "../sessions/models.js";
import type { ModelPolicyResolution, ModelResolution, SessionModelRequest } from "../sessions/model-types.js";
import { readSessionRecordedModel } from "../sessions/transcript-store.js";
import {
  addOpenAICompatibleModel,
} from "../setup/pi-model-registry.js";
import {
  createCommandGroup,
  parseCommandArgs,
  printError,
  requireArg,
  UsageError,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("models");

interface ResolvedSessionRef {
  label: string;
  kind: string;
  channel?: string;
  dir: string;
  cwd?: string;
}

interface ModelPolicyView {
  name: string;
  candidates: ModelSelectionConfig[];
  resolution: ModelPolicyResolution;
}

interface ModelResolveView {
  agentId: string;
  configuredDefault: {
    source: "agent" | "default";
    policy: string;
    resolution: ModelPolicyResolution;
  };
  requestedPolicy?: string;
  session: (ResolvedSessionRef & {
    restoreSavedModel: boolean;
    recordedModel?: ModelRef;
  }) | null;
  effective: {
    source: ModelResolution["source"];
    policy?: string;
    model?: ModelRef;
  };
  problems: string[];
}

const cmdModelPolicies: CommandHandler = createCommandGroup({
  name: "policies",
  path: ["models", "policies"],
  usage: USAGE,
  default: ({ argv, config }) => cmdModelPoliciesList(argv, config),
  commands: {
    list: ({ argv, config }) => cmdModelPoliciesList(argv, config),
    show: ({ argv, config }) => cmdModelPoliciesShow(argv, config),
    set: ({ argv, config }) => cmdModelPoliciesSet(argv, config),
    "add-candidate": ({ argv, config }) => cmdModelPoliciesAddCandidate(argv, config),
    "remove-candidate": ({ argv, config }) => cmdModelPoliciesRemoveCandidate(argv, config),
    "move-candidate": ({ argv, config }) => cmdModelPoliciesMoveCandidate(argv, config),
  },
});

const cmdModelProviders: CommandHandler = createCommandGroup({
  name: "providers",
  path: ["models", "providers"],
  usage: USAGE,
  commands: {
    "add-openai-compatible": ({ argv, config }) =>
      cmdModelProvidersAddOpenAICompatible(argv, config),
  },
});

export const cmdModels: CommandHandler = createCommandGroup({
  name: "models",
  usage: USAGE,
  default: ({ argv, config }) => cmdModelsList(argv, config),
  commands: {
    resolve: ({ argv, config }) => cmdModelsResolve(argv, config),
    policies: ({ argv, config }) => cmdModelPolicies(argv, config),
    providers: ({ argv, config }) => cmdModelProviders(argv, config),
  },
});

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
  const available = await bootstrap.modelRuntime.getAvailable();
  const policies = listPolicyViews(config, bootstrap);
  const agentDefaults = runtime.resolved.agents.map((agent) => {
    const policy = agent.modelPolicy ?? DEFAULT_MODEL_POLICY;
    const resolution = resolveModelPolicy(
      bootstrap,
      policy,
      agent.modelPolicy ? "agent" : "default",
    );
    return {
      id: agent.id,
      policy,
      source: agent.modelPolicy ? "agent" : "default",
      selected: resolution.selected,
      usable: Boolean(resolution.selected),
      problems: resolution.problems,
    };
  });
  const problems = [
    ...policies.flatMap((policy) => policy.resolution.problems),
    ...agentDefaults.flatMap((agent) => agent.problems),
  ];

  const view = {
    modelPolicies: policies,
    agentDefaults,
    providers: groupModelsByProvider(available),
    problems: [...new Set(problems)],
  };

  if (values.json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  console.log("Models");
  console.log("");
  printPolicyViews(policies);
  console.log("");
  console.log("Agent defaults");
  for (const agent of agentDefaults) {
    const selected = agent.selected ? ` -> ${formatModelRef(agent.selected)}` : "";
    console.log(`  ${agent.id}: ${agent.policy}${selected}`);
  }
  console.log("");
  printAvailableModels(groupModelsByProvider(available), agentDefaults);
  if (view.problems.length > 0) {
    console.log("");
    console.log("Problems");
    for (const problem of view.problems) console.log(`  ${problem}`);
  }
  console.log("");
  console.log("Inspect");
  console.log("  shrimpy models policies");
  console.log("  shrimpy models resolve --agent <id> --session tui");
  console.log("  shrimpy models resolve --agent <id> --channel <name>");
  return 0;
}

async function cmdModelPoliciesList(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
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
  const policies = listPolicyViews(config, bootstrap);

  if (values.json) {
    console.log(JSON.stringify({ modelPolicies: policies }, null, 2));
    return 0;
  }

  console.log("Model Policies");
  printPolicyViews(policies);
  return 0;
}

async function cmdModelPoliciesShow(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const name = requireArg(positionals[0], USAGE, "policy name");
  const runtime = createAppRuntime(config);
  const bootstrap = await runtime.createBootstrap();
  const policy = config.modelPolicies?.[name];
  const view: ModelPolicyView = {
    name,
    candidates: policy?.candidates ?? [],
    resolution: resolveModelPolicy(bootstrap, name, "default"),
  };

  if (values.json) {
    console.log(JSON.stringify(view, null, 2));
    return view.resolution.selected ? 0 : 1;
  }

  console.log(`Model Policy: ${name}`);
  printPolicyView(view);
  return view.resolution.selected ? 0 : 1;
}

async function cmdModelPoliciesSet(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      candidate: { type: "string", multiple: true },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const name = requireArg(positionals[0], USAGE, "policy name");
  const candidates = (values.candidate ?? []).map((candidate) => parseModelRef(candidate));
  if (candidates.length === 0) {
    return printError("models policies set requires at least one --candidate <provider>/<model>");
  }

  const result = editModelPolicies(config.workspace, (policies) => {
    policies[name] = { candidates: uniqueModelCandidates(candidates) };
  });
  return printPolicyMutation("set", name, result, values.json);
}

async function cmdModelPoliciesAddCandidate(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      index: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const name = requireArg(positionals[0], USAGE, "policy name");
  const candidate = parseModelRef(requireArg(positionals[1], USAGE, "candidate"));
  const result = editModelPolicies(config.workspace, (policies) => {
    const policy = requireModelPolicy(policies, name);
    const candidates = uniqueModelCandidates([
      ...policy.candidates.filter((existing) => !sameModelRef(existing, candidate)),
    ]);
    const index = values.index === undefined
      ? candidates.length
      : parseModelPolicyIndex(values.index, candidates.length);
    candidates.splice(index, 0, candidate);
    policies[name] = { candidates };
  });
  return printPolicyMutation("add-candidate", name, result, values.json);
}

async function cmdModelPoliciesRemoveCandidate(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const name = requireArg(positionals[0], USAGE, "policy name");
  const candidate = parseModelRef(requireArg(positionals[1], USAGE, "candidate"));
  const result = editModelPolicies(config.workspace, (policies) => {
    const policy = requireModelPolicy(policies, name);
    const candidates = policy.candidates.filter((existing) => !sameModelRef(existing, candidate));
    if (candidates.length === policy.candidates.length) {
      throw new Error(`candidate not found in ${name}: ${formatModelRef(candidate)}`);
    }
    policies[name] = { candidates };
  });
  return printPolicyMutation("remove-candidate", name, result, values.json);
}

async function cmdModelPoliciesMoveCandidate(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      index: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const name = requireArg(positionals[0], USAGE, "policy name");
  const candidate = parseModelRef(requireArg(positionals[1], USAGE, "candidate"));
  if (values.index === undefined) return printError("move-candidate requires --index <n>");
  const result = editModelPolicies(config.workspace, (policies) => {
    const policy = requireModelPolicy(policies, name);
    const currentIndex = policy.candidates.findIndex((existing) => sameModelRef(existing, candidate));
    if (currentIndex < 0) {
      throw new Error(`candidate not found in ${name}: ${formatModelRef(candidate)}`);
    }
    const candidates = [...policy.candidates];
    const [removed] = candidates.splice(currentIndex, 1);
    if (!removed) throw new Error(`candidate not found in ${name}: ${formatModelRef(candidate)}`);
    const nextIndex = parseModelPolicyIndex(values.index!, candidates.length);
    candidates.splice(nextIndex, 0, removed);
    policies[name] = { candidates };
  });
  return printPolicyMutation("move-candidate", name, result, values.json);
}

async function cmdModelProvidersAddOpenAICompatible(
  argv: string[],
  config: ShrimpyConfig,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      provider: { type: "string" },
      endpoint: { type: "string" },
      model: { type: "string", short: "m" },
      name: { type: "string" },
      "context-window": { type: "string" },
      "max-tokens": { type: "string" },
      "thinking-format": { type: "string" },
      "set-coding": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: USAGE,
  });

  const modelId = requireArg(values.model, USAGE, "--model");
  const provider = requireArg(values.provider, USAGE, "--provider");

  const contextWindow = parseOptionalPositiveInteger(
    values["context-window"],
    "--context-window",
  );
  const maxTokens = parseOptionalPositiveInteger(values["max-tokens"], "--max-tokens");
  const thinkingFormat = (values["thinking-format"]?.trim() ?? "") || undefined;

  try {
    const result = addOpenAICompatibleModel({
      workspace: config.workspace,
      provider,
      endpoint: values.endpoint,
      modelId,
      name: values.name,
      contextWindow,
      maxTokens,
      thinkingFormat,
      setCoding: values["set-coding"],
    });

    if (values.json) {
      console.log(JSON.stringify({
        model: {
          provider: result.provider,
          id: result.modelId,
          endpoint: result.endpoint,
        },
        modelsPath: result.modelsPath,
        ...(result.configPath ? { configPath: result.configPath } : {}),
        setCoding: result.setCoding,
      }, null, 2));
      return 0;
    }

    console.log(`Added provider model ${result.provider}/${result.modelId}.`);
    console.log(`Endpoint: ${result.endpoint}`);
    console.log(`Model registry: ${result.modelsPath}`);
    if (result.configPath) {
      console.log(`Updated ${DEFAULT_MODEL_POLICY} model policy in ${result.configPath}.`);
    }
    return 0;
  } catch (err) {
    return printError(err instanceof Error ? err.message : String(err));
  }
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
      policy: { type: "string" },
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
      kind: "channel",
      channel: values.channel,
      dir: sessionRootPath(agentPaths.root, parseSessionId(
        agent.id,
        `channel/${encodeURIComponent(values.channel)}`,
      )),
    }
    : values.session
      ? resolveSessionRef(agentPaths.root, agent.id, values.session)
      : null;

  const defaultPolicyName = agent.modelPolicy ?? DEFAULT_MODEL_POLICY;
  const configuredDefault = {
    source: agent.modelPolicy ? "agent" as const : "default" as const,
    policy: defaultPolicyName,
    resolution: resolveModelPolicy(
      bootstrap,
      defaultPolicyName,
      agent.modelPolicy ? "agent" : "default",
    ),
  };
  const problems: string[] = [];

  const modelRequest: SessionModelRequest = {
    provider: values.provider,
    model: values.model,
    modelPolicy: values.policy,
    defaultModelPolicy: agent.modelPolicy,
    allowMissingModel: true,
  };
  const sessionRestoresSavedModel = session
    ? sessionCanRestoreSavedModel(session)
    : false;
  const sessionRecord = session && shouldRestoreSavedSessionModel(modelRequest)
    ? readSessionRecordedModel(session.cwd ?? agentPaths.root, session.dir)
    : undefined;

  let resolution: ModelResolution = {
    source: "missing",
    problems: [],
  };
  try {
    resolution = resolveSessionModel({
      bootstrap,
      ...modelRequest,
      readSavedModel: sessionRestoresSavedModel
        ? () => sessionRecord
        : undefined,
    });
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  problems.push(...resolution.problems);

  const view: ModelResolveView = {
    agentId: agent.id,
    configuredDefault,
    ...(values.policy ? { requestedPolicy: values.policy } : {}),
    session: session
      ? {
        ...session,
        restoreSavedModel: sessionRestoresSavedModel,
        ...(sessionRecord ? { recordedModel: sessionRecord } : {}),
      }
      : null,
    effective: {
      source: resolution.source,
      ...(resolution.policy ? { policy: resolution.policy.name } : {}),
      ...(resolution.modelRef ? { model: resolution.modelRef } : {}),
    },
    problems: [...new Set(problems)],
  };

  if (values.json) {
    console.log(JSON.stringify(view, null, 2));
    return view.effective.model ? 0 : 1;
  }

  console.log("Model Resolution");
  console.log("");
  console.log(`agent: ${view.agentId}`);
  console.log(`configured policy: ${view.configuredDefault.policy} (${view.configuredDefault.source})`);
  if (view.requestedPolicy) console.log(`requested policy: ${view.requestedPolicy}`);
  if (view.session) {
    console.log(`session: ${view.session.kind}:${view.session.label}`);
    console.log(`session dir: ${view.session.dir}`);
    console.log(`session restore: ${view.session.restoreSavedModel ? "yes" : "no"}`);
    if (view.session.recordedModel) {
      console.log(`recorded session model: ${formatModelRef(view.session.recordedModel)}`);
    }
  }
  console.log(`effective: ${view.effective.model ? `${formatModelRef(view.effective.model)} (${view.effective.source})` : "missing"}`);
  if (view.effective.policy) console.log(`effective policy: ${view.effective.policy}`);
  if (view.problems.length > 0) {
    console.log("");
    console.log("Problems");
    for (const problem of view.problems) console.log(`  ${problem}`);
  }

  return view.effective.model ? 0 : 1;
}

function parseOptionalPositiveInteger(
  raw: string | undefined,
  label: string,
): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${label} must be a positive integer\n\n${USAGE}`);
  }
  return parsed;
}

function resolveSessionRef(
  agentRoot: string,
  agentId: string,
  raw: string,
): ResolvedSessionRef {
  const key = parseSessionId(agentId, raw);
  return {
    label: formatSessionId(key),
    kind: key.namespace,
    ...(key.namespace === "channel" ? { channel: key.name } : {}),
    dir: sessionRootPath(agentRoot, key),
  };
}

function sessionCanRestoreSavedModel(_session: ResolvedSessionRef): boolean {
  return true;
}

function listPolicyViews(
  config: ShrimpyConfig,
  bootstrap: SessionBootstrap,
): ModelPolicyView[] {
  return Object.entries(config.modelPolicies ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, policy]) => ({
      name,
      candidates: policy.candidates,
      resolution: resolveModelPolicy(bootstrap, name, "default"),
    }));
}

function groupModelsByProvider(models: readonly Model<Api>[]): Array<{
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

function printPolicyViews(policies: ModelPolicyView[]): void {
  console.log("Model policies");
  if (policies.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const policy of policies) printPolicyView(policy);
}

function printPolicyView(policy: ModelPolicyView): void {
  const selected = policy.resolution.selected
    ? ` -> ${formatModelRef(policy.resolution.selected)}`
    : "";
  console.log(`  ${policy.name}${selected}`);
  for (const candidate of policy.resolution.candidates) {
    const marker = candidate.selected ? "*" : "-";
    const reason = candidate.reason ? ` (${candidate.reason})` : "";
    console.log(`    ${marker} ${formatModelRef(candidate)}${reason}`);
  }
  for (const problem of policy.resolution.problems) {
    console.log(`    problem: ${problem}`);
  }
}

function printAvailableModels(
  providers: Array<{ provider: string; models: ModelRef[] }>,
  agentDefaults: Array<{ id: string; selected?: ModelRef }>,
): void {
  console.log("Available models");
  if (providers.length === 0) {
    console.log("  (none)");
  } else {
    for (const provider of providers) {
      console.log(`  ${provider.provider}`);
      for (const model of provider.models) {
        const usedBy = agentDefaults
          .filter((agent) =>
            agent.selected?.provider === provider.provider && agent.selected.id === model.id
          )
          .map((agent) => agent.id);
        console.log(`    - ${model.id}${usedBy.length ? `  used by: ${usedBy.join(", ")}` : ""}`);
      }
    }
  }
}

function printPolicyMutation(
  action: string,
  name: string,
  result: {
    configPath: string;
    policies: ModelPoliciesConfig;
  },
  json: boolean,
): number {
  const body = {
    action,
    policy: name,
    configPath: result.configPath,
    modelPolicy: result.policies[name],
  };
  if (json) {
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log(`${action} model policy ${name}`);
    console.log(`config: ${result.configPath}`);
    console.log(`candidates: ${body.modelPolicy?.candidates.map((candidate) => formatModelRef(candidate)).join(", ") ?? "(missing)"}`);
  }
  return 0;
}
