import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  createAgentPaths,
  createAppRuntime,
  createWorkspacePaths,
} from "../app/index.js";
import {
  hasPrimaryConfig,
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  DEFAULT_MODEL_POLICY,
  formatModelSelection,
  type ModelSelectionConfig,
} from "../config/model.js";
import {
  resolveModelPolicy,
  runInteractiveAgentSession,
  type ModelPolicyResolution,
} from "../sessions/index.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import {
  ensureWorkspaceInitialized,
  MECHANIC_AGENT_ID,
  type SetupInitResult,
} from "./init.js";

export interface SetupModelView {
  provider: string;
  id: string;
  name?: string;
}

export interface SetupSessionLaunchInput {
  config: ShrimpyConfig;
  cwd?: string;
}

export interface SetupInteractiveSessionSpec {
  agentId: typeof MECHANIC_AGENT_ID;
  channel: "setup";
  sessionType: "tui";
  initialMessage: string;
  skills: ["setup"];
  modelPolicy: typeof DEFAULT_MODEL_POLICY;
  cwd?: string;
}

export interface RunSetupEntryDeps {
  cwd?: string;
  confirmExistingConfig?: (configPath: string) => Promise<boolean>;
  confirmReplaceModelPolicy?: (input: ConfirmReplaceModelPolicyInput) => Promise<boolean>;
  launchSetupSession?: (input: SetupSessionLaunchInput) => Promise<void>;
  listModels?: (workspace: string) => SetupModelView[];
  selectCodingModel?: (input: SelectSetupModelInput) => Promise<SetupModelView | undefined>;
  log?: (line: string) => void;
}

export interface SetupEntryResult {
  kind:
    | "already_configured"
    | "needs_provider"
    | "needs_policy"
    | "skipped_existing_config"
    | "setup_started";
  init: SetupInitResult;
  models: SetupModelView[];
  policyProblems?: SetupPolicyProblem[];
}

export interface SelectSetupModelInput {
  policy: string;
  models: SetupModelView[];
  currentCandidates: ModelSelectionConfig[];
  problems: string[];
}

export interface ConfirmReplaceModelPolicyInput extends SelectSetupModelInput {
  configPath: string;
  replacement: SetupModelView;
}

export interface SetupPolicyProblem {
  policy: string;
  problems: string[];
}

interface SetupModelCandidate {
  provider?: unknown;
  id?: unknown;
  name?: unknown;
}

interface SetupPolicyBootstrapResult {
  ok: boolean;
  problems: SetupPolicyProblem[];
}

type PolicyState =
  | {
    kind: "missing";
    candidates: ModelSelectionConfig[];
    problems: string[];
  }
  | {
    kind: "invalid";
    candidates: ModelSelectionConfig[];
    problems: string[];
  }
  | {
    kind: "configured";
    candidates: ModelSelectionConfig[];
    problems: string[];
  };

export function listAvailableSetupModels(workspace: string): SetupModelView[] {
  try {
    const paths = createWorkspacePaths(workspace);
    const authStorage = AuthStorage.create(paths.authPath);
    const registry = ModelRegistry.create(authStorage, paths.modelsPath);
    return registry.getAvailable().map((model: SetupModelCandidate) => ({
      provider: String(model.provider ?? "unknown"),
      id: String(model.id ?? "unknown"),
      name: typeof model.name === "string" ? model.name : undefined,
    }));
  } catch {
    return [];
  }
}

export async function launchSetupSession(
  input: SetupSessionLaunchInput,
): Promise<void> {
  const runtime = createAppRuntime(input.config);
  await runInteractiveAgentSession({
    runtime,
    ...createSetupInteractiveSessionSpec(input),
  });
}

export function createSetupInteractiveSessionSpec(
  input: SetupSessionLaunchInput,
): SetupInteractiveSessionSpec {
  return {
    agentId: MECHANIC_AGENT_ID,
    channel: "setup",
    sessionType: "tui",
    initialMessage: "Begin setup.",
    skills: ["setup"],
    modelPolicy: DEFAULT_MODEL_POLICY,
    cwd: input.cwd,
  };
}

export async function runSetupEntry(
  workspace: string,
  deps?: RunSetupEntryDeps,
): Promise<SetupEntryResult> {
  const log = deps?.log ?? ((line: string) => console.log(line));
  const cwd = deps?.cwd ?? workspace;
  if (isSetupAlreadyConfigured(workspace)) {
    log("");
    log("shrimpy setup");
    log("");
    log("Setup already has a model policy and agent context. Nothing to do.");
    return {
      kind: "already_configured",
      init: { created: [], existing: [] },
      models: [],
    };
  }

  const hadPrimaryConfig = hasPrimaryConfig(workspace);
  const init = ensureWorkspaceInitialized(workspace);
  const listModels = deps?.listModels ?? listAvailableSetupModels;
  let models = listModels(workspace);

  log("");
  log("shrimpy setup");
  log("");

  if (init.created.length > 0) {
    log(
      `Initialized ${init.created.length} workspace ${init.created.length === 1 ? "file" : "files"}.`,
    );
  }

  if (models.length === 0) {
    const paths = createWorkspacePaths(workspace);
    log("No working models found yet.");
    log(
      `Configure at least one provider/model in ${paths.authPath} and ${paths.modelsPath}, then rerun \`shrimpy setup\`.`,
    );
    return {
      kind: "needs_provider",
      init,
      models,
    };
  }

  const preview = models.slice(0, 2).map(formatModelLabel).join(", ");
  log(
    `Found ${models.length} available model${models.length === 1 ? "" : "s"}${preview ? `: ${preview}` : ""}.`,
  );

  const policyBootstrap = await ensureSetupModelPolicies(workspace, models, deps, log);
  if (!policyBootstrap.ok) {
    return {
      kind: "needs_policy",
      init,
      models,
      policyProblems: policyBootstrap.problems,
    };
  }

  if (hadPrimaryConfig) {
    const configPath = createWorkspacePaths(workspace).primaryConfigPath;
    const confirmed = await (deps?.confirmExistingConfig ?? confirmExistingConfig)(
      configPath,
      log,
    );
    if (!confirmed) {
      log("Setup rerun cancelled.");
      return {
        kind: "skipped_existing_config",
        init,
        models,
      };
    }
  }

  log("Launching interactive setup session...");

  const config = loadConfigForWorkspace(workspace);
  await (deps?.launchSetupSession ?? launchSetupSession)({
    config,
    cwd,
  });

  return {
    kind: "setup_started",
    init,
    models,
  };
}

function formatModelLabel(model: SetupModelView): string {
  return `${model.provider}/${model.id}`;
}

function isSetupAlreadyConfigured(workspace: string): boolean {
  const paths = createWorkspacePaths(workspace);
  if (!existsSync(paths.primaryConfigPath)) return false;

  let raw: Record<string, unknown>;
  try {
    raw = readJsonFileStrict(
      paths.primaryConfigPath,
      (parsed) => parsed as Record<string, unknown>,
    );
  } catch {
    return false;
  }

  if (readPolicyState(raw.modelPolicies, DEFAULT_MODEL_POLICY).kind !== "configured") {
    return false;
  }
  if (!resolvePolicyAgainstRawConfig(workspace, raw, DEFAULT_MODEL_POLICY).selected) {
    return false;
  }

  const shrimpyRoot = findAgentRoot(raw.agents, "shrimpy");
  const mechanicRoot = findAgentRoot(raw.agents, MECHANIC_AGENT_ID);
  return existsSync(createAgentPaths(workspace, shrimpyRoot).contextDir) &&
    existsSync(createAgentPaths(workspace, mechanicRoot).contextDir);
}

function findAgentRoot(rawAgents: unknown, agentId: string): string {
  if (Array.isArray(rawAgents)) {
    const found = rawAgents.find((entry) => isRecord(entry) && entry.id === agentId);
    if (isRecord(found) && typeof found.root === "string" && found.root) {
      return found.root;
    }
  }
  return `agents/${agentId}`;
}

async function ensureSetupModelPolicies(
  workspace: string,
  models: SetupModelView[],
  deps: RunSetupEntryDeps | undefined,
  log: (line: string) => void,
): Promise<SetupPolicyBootstrapResult> {
  const paths = createWorkspacePaths(workspace);
  if (!existsSync(paths.primaryConfigPath)) {
    return {
      ok: false,
      problems: [{
        policy: "config",
        problems: [`config not found: ${paths.primaryConfigPath}`],
      }],
    };
  }
  if (models.length === 0) {
    return {
      ok: false,
      problems: [{
        policy: DEFAULT_MODEL_POLICY,
        problems: ["no available models to use as a policy candidate"],
      }],
    };
  }

  const raw = readJsonFileStrict(
    paths.primaryConfigPath,
    (parsed) => parsed as Record<string, unknown>,
  );
  const policyState = readPolicyState(raw.modelPolicies, DEFAULT_MODEL_POLICY);
  let changed = false;

  if (policyState.kind === "missing") {
    const selected = await selectCodingModelCandidate({
      policy: DEFAULT_MODEL_POLICY,
      models,
      currentCandidates: [],
      problems: [],
    }, deps, log);
    if (!selected) {
      return {
        ok: false,
        problems: [{
          policy: DEFAULT_MODEL_POLICY,
          problems: ["no model selected for coding policy"],
        }],
      };
    }
    setModelPolicy(raw, DEFAULT_MODEL_POLICY, selected);
    changed = true;
    log(`Created ${DEFAULT_MODEL_POLICY} model policy from ${formatModelLabel(selected)}.`);
  } else {
    const resolution = policyState.kind === "configured"
      ? resolvePolicyAgainstRawConfig(workspace, raw, DEFAULT_MODEL_POLICY)
      : undefined;
    const problems = policyState.kind === "invalid"
      ? policyState.problems
      : resolution?.problems ?? [];

    if (resolution?.selected) {
      log(
        `Model policy ${DEFAULT_MODEL_POLICY} resolves to ${formatModelSelection(resolution.selected)}.`,
      );
    } else {
      const replacement = await selectCodingModelCandidate({
        policy: DEFAULT_MODEL_POLICY,
        models,
        currentCandidates: policyState.candidates,
        problems,
      }, deps, log);
      if (replacement) {
        const current = policyState.candidates.length > 0
          ? policyState.candidates.map(formatModelSelection).join(", ")
          : "(invalid or empty)";
        log(
          `Proposed ${DEFAULT_MODEL_POLICY} replacement: ${current} -> ${formatModelLabel(replacement)}.`,
        );
      }
      const confirmed = replacement
        ? await (deps?.confirmReplaceModelPolicy ?? confirmReplaceModelPolicy)({
          policy: DEFAULT_MODEL_POLICY,
          models,
          currentCandidates: policyState.candidates,
          problems,
          configPath: paths.primaryConfigPath,
          replacement,
        })
        : false;

      if (!confirmed || !replacement) {
        logPolicyProblems(DEFAULT_MODEL_POLICY, problems, log);
        return {
          ok: false,
          problems: [{
            policy: DEFAULT_MODEL_POLICY,
            problems,
          }],
        };
      }

      setModelPolicy(raw, DEFAULT_MODEL_POLICY, replacement);
      changed = true;
      log(
        `Replaced ${DEFAULT_MODEL_POLICY} model policy with ${formatModelLabel(replacement)}.`,
      );
    }
  }

  changed = ensureDefaultAgentModelPolicies(raw, log) || changed;

  if (changed) writeJsonFileAtomic(paths.primaryConfigPath, raw);

  return smokeTestSetupPolicies(workspace, log);
}

async function selectCodingModelCandidate(
  input: SelectSetupModelInput,
  deps: RunSetupEntryDeps | undefined,
  log: (line: string) => void,
): Promise<SetupModelView | undefined> {
  const selected = deps?.selectCodingModel
    ? await deps.selectCodingModel(input)
    : await selectCodingModel(input, log);
  if (!selected) return undefined;
  return input.models.find((model) => sameSetupModel(model, selected)) ?? selected;
}

async function selectCodingModel(
  input: SelectSetupModelInput,
  log: (line: string) => void,
): Promise<SetupModelView | undefined> {
  if (input.models.length === 0) return undefined;
  if (input.models.length === 1 || !stdin.isTTY || !stdout.isTTY) {
    return input.models[0];
  }

  log("");
  log(`Choose the model candidate for ${input.policy}.`);
  input.models.forEach((model, index) => {
    const suffix = model.name ? ` (${model.name})` : "";
    log(`  ${index + 1}. ${formatModelLabel(model)}${suffix}`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Use which model for ${input.policy}? [1] `);
    const index = answer.trim() ? Number(answer.trim()) - 1 : 0;
    return Number.isInteger(index) && index >= 0 && index < input.models.length
      ? input.models[index]
      : undefined;
  } finally {
    rl.close();
  }
}

async function confirmReplaceModelPolicy(
  input: ConfirmReplaceModelPolicyInput,
): Promise<boolean> {
  const current = input.currentCandidates.length > 0
    ? input.currentCandidates.map(formatModelSelection).join(", ")
    : "(invalid or empty)";
  const replacement = formatModelLabel(input.replacement);

  if (!stdin.isTTY || !stdout.isTTY) {
    return false;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `Replace model policy ${input.policy} in ${input.configPath}: ${current} -> ${replacement}? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function readPolicyState(rawPolicies: unknown, name: string): PolicyState {
  if (!isRecord(rawPolicies) || !(name in rawPolicies)) {
    return { kind: "missing", candidates: [], problems: [] };
  }

  const policy = rawPolicies[name];
  if (!isRecord(policy)) {
    return {
      kind: "invalid",
      candidates: [],
      problems: [`model policy ${name} must be an object`],
    };
  }

  const rawCandidates = policy.candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    return {
      kind: "invalid",
      candidates: [],
      problems: [`model policy ${name} must contain at least one candidate`],
    };
  }

  const candidates: ModelSelectionConfig[] = [];
  const problems: string[] = [];
  rawCandidates.forEach((candidate, index) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.provider !== "string" ||
      typeof candidate.id !== "string" ||
      !candidate.provider ||
      !candidate.id
    ) {
      problems.push(`model policy ${name} candidate ${index + 1} must be { provider, id }`);
      return;
    }
    candidates.push({
      provider: candidate.provider,
      id: candidate.id,
    });
  });

  return problems.length > 0
    ? { kind: "invalid", candidates, problems }
    : { kind: "configured", candidates, problems: [] };
}

function resolvePolicyAgainstRawConfig(
  workspace: string,
  raw: Record<string, unknown>,
  name: string,
): ModelPolicyResolution {
  return resolveModelPolicy(
    {
      config: {
        ...raw,
        workspace,
      } as ShrimpyConfig,
      modelRegistry: createSetupModelRegistry(workspace),
    } as unknown as Parameters<typeof resolveModelPolicy>[0],
    name,
    "default",
  );
}

async function smokeTestSetupPolicies(
  workspace: string,
  log: (line: string) => void,
): Promise<SetupPolicyBootstrapResult> {
  const problems: SetupPolicyProblem[] = [];

  try {
    const config = loadConfigForWorkspace(workspace);
    const runtime = createAppRuntime(config);
    const mainAgent = runtime.resolved.agents.find((agent) => agent.id === "shrimpy");
    const mechanicAgent = runtime.resolved.agents.find((agent) => agent.id === MECHANIC_AGENT_ID);
    const bootstrapAgent = mechanicAgent ?? mainAgent ?? runtime.getAgent();
    const bootstrap = await runtime.createBootstrap({ agentId: bootstrapAgent.id });
    const coding = resolveModelPolicy(bootstrap, DEFAULT_MODEL_POLICY, "default");

    if (!coding.selected) {
      problems.push({
        policy: DEFAULT_MODEL_POLICY,
        problems: coding.problems,
      });
    } else {
      log(
        `Smoke-tested ${DEFAULT_MODEL_POLICY}: ${formatModelSelection(coding.selected)}.`,
      );
    }

    if (!mainAgent) {
      problems.push({
        policy: "agent:shrimpy",
        problems: ["config agents must include the shrimpy agent"],
      });
    }
    if (!mechanicAgent) {
      problems.push({
        policy: `agent:${MECHANIC_AGENT_ID}`,
        problems: [`config agents must include the ${MECHANIC_AGENT_ID} agent`],
      });
    }
  } catch (err) {
    problems.push({
      policy: "config",
      problems: [err instanceof Error ? err.message : String(err)],
    });
  }

  for (const problem of problems) {
    logPolicyProblems(problem.policy, problem.problems, log);
  }

  return {
    ok: problems.length === 0,
    problems,
  };
}

function setModelPolicy(
  raw: Record<string, unknown>,
  name: string,
  model: SetupModelView,
): void {
  const policies = isRecord(raw.modelPolicies)
    ? { ...raw.modelPolicies }
    : {};
  policies[name] = {
    candidates: [{ provider: model.provider, id: model.id }],
  };
  raw.modelPolicies = policies;
}

function ensureDefaultAgentModelPolicies(
  raw: Record<string, unknown>,
  log: (line: string) => void,
): boolean {
  if (!Array.isArray(raw.agents)) return false;

  let changed = false;
  const agents = raw.agents.map((entry) => {
    if (
      !isRecord(entry) ||
      (entry.id !== "shrimpy" && entry.id !== MECHANIC_AGENT_ID) ||
      entry.modelPolicy !== undefined
    ) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      modelPolicy: DEFAULT_MODEL_POLICY,
    };
  });

  if (changed) {
    raw.agents = agents;
    log(`Defaulted setup agents to model policy ${DEFAULT_MODEL_POLICY}.`);
  }
  return changed;
}

function createSetupModelRegistry(workspace: string): ModelRegistry {
  const paths = createWorkspacePaths(workspace);
  const authStorage = AuthStorage.create(paths.authPath);
  return ModelRegistry.create(authStorage, paths.modelsPath);
}

function logPolicyProblems(
  policy: string,
  problems: string[],
  log: (line: string) => void,
): void {
  log(`Model policy ${policy} is unresolved.`);
  for (const problem of problems.length > 0 ? problems : ["no usable model candidate"]) {
    log(`  ${problem}`);
  }
  log("Inspect model policy state with:");
  log("  shrimpy models");
  log(`  shrimpy models policies show ${policy}`);
  log(`  shrimpy models resolve --policy ${policy} --json`);
}

function sameSetupModel(left: SetupModelView, right: SetupModelView): boolean {
  return left.provider === right.provider && left.id === right.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function confirmExistingConfig(
  configPath: string,
  log: (line: string) => void,
): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) {
    log(`Existing config found at ${configPath}. Interactive confirmation is required to rerun setup.`);
    return false;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `Workspace config already exists at ${configPath}. Rerun interactive setup? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
