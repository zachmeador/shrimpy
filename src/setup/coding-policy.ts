import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createAgentPaths, createWorkspacePaths } from "../workspace/paths.js";
import { createAppRuntime } from "../app/runtime.js";
import { loadConfigForWorkspace } from "../config/load.js";
import {
  editConfigFile,
  readConfigFile,
} from "../config/store.js";
import {
  DEFAULT_MODEL_POLICY,
  formatModelRef,
  formatModelSelection,
  sameModelRef,
  type ModelSelectionConfig,
} from "../config/model.js";
import {
  resolveModelPolicy,
} from "../sessions/models.js";
import type { ModelPolicyResolution } from "../sessions/model-types.js";
import { isRecord } from "../util/record.js";
import { MECHANIC_AGENT_ID } from "./init.js";
import type { SetupModelView } from "./model-access.js";

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

interface CodingPolicyDeps {
  confirmReplaceModelPolicy?: (input: ConfirmReplaceModelPolicyInput) => Promise<boolean>;
  selectCodingModel?: (input: SelectSetupModelInput) => Promise<SetupModelView | undefined>;
}

interface CodingPolicyResult {
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

export function formatModelLabel(model: SetupModelView): string {
  return formatModelRef(model);
}

export async function ensureCodingModelPolicy(
  workspace: string,
  models: SetupModelView[],
  deps: CodingPolicyDeps | undefined,
  log: (line: string) => void,
): Promise<CodingPolicyResult> {
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

  const raw = loadRawSetupConfig(workspace);
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

  if (changed) {
    editConfigFile(workspace, (nextRaw) => {
      for (const key of Object.keys(nextRaw)) delete nextRaw[key];
      Object.assign(nextRaw, raw);
    }, { missing: "error" });
  }

  return smokeTestSetupPolicies(workspace, log);
}

export function loadRawSetupConfig(workspace: string): Record<string, unknown> {
  return readConfigFile(workspace, { missing: "error" }).raw;
}

export function readPolicyState(rawPolicies: unknown, name: string): PolicyState {
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

export function resolvePolicyAgainstRawConfig(
  workspace: string,
  raw: Record<string, unknown>,
  name: string,
): ModelPolicyResolution {
  return resolveModelPolicy(
    {
      modelPolicies: raw.modelPolicies,
      modelRegistry: createSetupModelRegistry(workspace),
    } as unknown as Parameters<typeof resolveModelPolicy>[0],
    name,
    "default",
  );
}

export function hasSetupAgentWorkspace(workspace: string, raw: Record<string, unknown>): boolean {
  const shrimpyRoot = findAgentRoot(raw.agents, "shrimpy");
  const mechanicRoot = findAgentRoot(raw.agents, MECHANIC_AGENT_ID);
  const shrimpyPaths = createAgentPaths(workspace, shrimpyRoot);
  const mechanicPaths = createAgentPaths(workspace, mechanicRoot);
  return existsSync(shrimpyPaths.soulPath) &&
    existsSync(mechanicPaths.soulPath) &&
    existsSync(join(mechanicPaths.contextDir, "scope.md"));
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

async function selectCodingModelCandidate(
  input: SelectSetupModelInput,
  deps: CodingPolicyDeps | undefined,
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

async function smokeTestSetupPolicies(
  workspace: string,
  log: (line: string) => void,
): Promise<CodingPolicyResult> {
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
  return sameModelRef(left, right);
}
