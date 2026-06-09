import type { Api, Model } from "@earendil-works/pi-ai";
import { createAppRuntime } from "../app/index.js";
import {
  DEFAULT_MODEL_POLICY,
  formatModelRef,
  hasConfiguredAuth,
  parseModelRef,
  sameModelRef,
  toModelRef,
  validateModelPoliciesConfig,
  type ModelRef,
  type ModelPoliciesConfig,
  type ModelPolicyConfig,
  type ModelSelectionConfig,
  type ShrimpyConfig,
} from "../config/index.js";
import { editConfigFile } from "../config/store.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import {
  createGatewaySessionDescriptor,
  createLocalSessionDescriptor,
  resolveModelDetailed,
  resolveModelPolicy,
  type ModelPolicyResolution,
  type ModelResolution,
} from "../sessions/index.js";
import {
  createSessionManager,
  findActiveSessionFile,
} from "../sessions/storage.js";
import { isRecord } from "../util/record.js";
import {
  createCommandGroup,
  parseCommandArgs,
  printError,
  requireArg,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("models");

interface ResolvedSessionRef {
  label: string;
  kind: string;
  channel?: string;
  dir: string;
  restoreSavedModel: boolean;
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
    recordedModel?: ModelRef;
    recordedModelUsable?: boolean;
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

export const cmdModels: CommandHandler = createCommandGroup({
  name: "models",
  usage: USAGE,
  default: ({ argv, config }) => cmdModelsList(argv, config),
  commands: {
    resolve: ({ argv, config }) => cmdModelsResolve(argv, config),
    policies: ({ argv, config }) => cmdModelPolicies(argv, config),
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
  const available = bootstrap.modelRegistry.getAvailable();
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

  const result = editPolicies(config.workspace, (policies) => {
    policies[name] = { candidates: uniqueCandidates(candidates) };
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
  const result = editPolicies(config.workspace, (policies) => {
    const policy = requirePolicy(policies, name);
    const candidates = uniqueCandidates([
      ...policy.candidates.filter((existing) => !sameModelRef(existing, candidate)),
    ]);
    const index = values.index === undefined
      ? candidates.length
      : parseIndex(values.index, candidates.length);
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
  const result = editPolicies(config.workspace, (policies) => {
    const policy = requirePolicy(policies, name);
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
  const result = editPolicies(config.workspace, (policies) => {
    const policy = requirePolicy(policies, name);
    const currentIndex = policy.candidates.findIndex((existing) => sameModelRef(existing, candidate));
    if (currentIndex < 0) {
      throw new Error(`candidate not found in ${name}: ${formatModelRef(candidate)}`);
    }
    const candidates = [...policy.candidates];
    const [removed] = candidates.splice(currentIndex, 1);
    if (!removed) throw new Error(`candidate not found in ${name}: ${formatModelRef(candidate)}`);
    const nextIndex = parseIndex(values.index!, candidates.length);
    candidates.splice(nextIndex, 0, removed);
    policies[name] = { candidates };
  });
  return printPolicyMutation("move-candidate", name, result, values.json);
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

  const sessionRecord = session && !values.provider && !values.model && !values.policy
    ? readRecordedSessionModel(session.dir, process.cwd())
    : undefined;
  const recordedModelUsable = sessionRecord
    ? Boolean(findUsableModel(bootstrap.modelRegistry, sessionRecord))
    : undefined;
  if (sessionRecord && recordedModelUsable === false) {
    problems.push(`session recorded model not usable: ${formatModelRef(sessionRecord)}`);
  }

  let resolution: ModelResolution = {
    source: "missing",
    problems: [],
  };
  try {
    if (sessionRecord && recordedModelUsable && session?.restoreSavedModel) {
      resolution = {
        source: "saved-session",
        modelRef: sessionRecord,
        model: findUsableModel(bootstrap.modelRegistry, sessionRecord),
        problems: [],
      };
    } else {
      resolution = resolveModelDetailed(
        bootstrap,
        values.provider,
        values.model,
        values.policy ? undefined : agent.modelPolicy,
        {
          modelPolicy: values.policy,
          allowMissingDefault: true,
        },
      );
    }
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
        ...(sessionRecord ? { recordedModel: sessionRecord } : {}),
        ...(recordedModelUsable !== undefined ? { recordedModelUsable } : {}),
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
    restoreSavedModel: true,
  };
}

function readRecordedSessionModel(
  sessionDir: string,
  cwd: string,
): ModelRef | undefined {
  const file = findActiveSessionFile(sessionDir);
  if (!file) return undefined;
  const manager = createSessionManager(cwd, sessionDir);
  try {
    const model = manager.buildSessionContext().model;
    return model
      ? { provider: model.provider, id: model.modelId }
      : undefined;
  } catch {
    return undefined;
  }
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

function editPolicies(
  workspace: string,
  edit: (policies: ModelPoliciesConfig) => void,
): {
  configPath: string;
  policies: ModelPoliciesConfig;
} {
  let policies: ModelPoliciesConfig = {};
  const { configPath } = editConfigFile(workspace, (raw) => {
    policies = clonePolicies(raw.modelPolicies);
    edit(policies);
    validateModelPoliciesConfig(policies);
    raw.modelPolicies = policies;
  }, { missing: "error" });
  return { configPath, policies };
}

function clonePolicies(raw: unknown): ModelPoliciesConfig {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const policy = value as Partial<ModelPolicyConfig>;
      return [
        name,
        {
          candidates: Array.isArray(policy.candidates)
            ? policy.candidates.map((candidate) => ({ ...candidate }))
            : [],
        },
      ];
    }),
  ) as ModelPoliciesConfig;
}

function requirePolicy(policies: ModelPoliciesConfig, name: string): ModelPolicyConfig {
  const policy = policies[name];
  if (!policy) throw new Error(`model policy not found: ${name}`);
  return policy;
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

function parseIndex(raw: string, maxInclusive: number): number {
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index > maxInclusive) {
    throw new Error(`index must be an integer from 0 to ${maxInclusive}`);
  }
  return index;
}

function uniqueCandidates(candidates: ModelSelectionConfig[]): ModelSelectionConfig[] {
  const seen = new Set<string>();
  const unique: ModelSelectionConfig[] = [];
  for (const candidate of candidates) {
    const id = formatModelRef(candidate);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(candidate);
  }
  return unique;
}

function findUsableModel(
  modelRegistry: { find(provider: string, id: string): Model<Api> | undefined },
  ref: ModelRef,
): Model<Api> | undefined {
  const model = modelRegistry.find(ref.provider, ref.id);
  if (!model) return undefined;
  const registry = modelRegistry as {
    hasConfiguredAuth?: (candidate: Model<Api>) => boolean;
  };
  if (!hasConfiguredAuth(registry, model)) return undefined;
  return model;
}
