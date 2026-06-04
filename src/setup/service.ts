import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createAppRuntime, createWorkspacePaths } from "../app/index.js";
import {
  hasPrimaryConfig,
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import {
  runInteractiveAgentSession,
  runPiInteractiveAgentSession,
} from "../sessions/index.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import {
  ensureWorkspaceInitialized,
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

export interface RunSetupEntryDeps {
  cwd?: string;
  canLaunchProviderBootstrap?: () => boolean;
  confirmExistingConfig?: (configPath: string) => Promise<boolean>;
  launchProviderBootstrapSession?: (input: SetupSessionLaunchInput) => Promise<void>;
  launchSetupSession?: (input: SetupSessionLaunchInput) => Promise<void>;
  listModels?: (workspace: string) => SetupModelView[];
  log?: (line: string) => void;
}

export interface SetupEntryResult {
  kind: "needs_provider" | "skipped_existing_config" | "setup_started";
  init: SetupInitResult;
  models: SetupModelView[];
}

interface SetupModelCandidate {
  provider?: unknown;
  id?: unknown;
  name?: unknown;
}

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
    agentId: "shrimpy",
    channel: "setup",
    sessionType: "tui",
    initialMessage: "Begin setup.",
    skills: ["setup"],
    allowRegistryFallbackModel: true,
    cwd: input.cwd,
  });
}

export async function launchProviderBootstrapSession(
  input: SetupSessionLaunchInput,
): Promise<void> {
  const runtime = createAppRuntime(input.config);
  await runPiInteractiveAgentSession({
    runtime,
    agentId: "shrimpy",
    channel: "setup-provider",
    sessionType: "tui",
    allowMissingModel: true,
    cwd: input.cwd,
  });
}

export async function runSetupEntry(
  workspace: string,
  deps?: RunSetupEntryDeps,
): Promise<SetupEntryResult> {
  const log = deps?.log ?? ((line: string) => console.log(line));
  const cwd = deps?.cwd ?? workspace;
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
    if ((deps?.canLaunchProviderBootstrap ?? canLaunchProviderBootstrap)()) {
      log("No working models found yet.");
      log("Launching provider bootstrap session...");
      log("Use Pi's /login and /model commands to get one working model.");

      const config = loadConfigForWorkspace(workspace);
      await (deps?.launchProviderBootstrapSession ?? launchProviderBootstrapSession)({
        config,
        cwd,
      });

      models = listModels(workspace);
    }

    if (models.length === 0) {
      const paths = createWorkspacePaths(workspace);
      log("No working models found yet.");
      log(
        `Configure at least one provider/model in ${paths.authPath} and ${paths.modelsPath}, or rerun \`shrimpy setup\` and use /login then /model in the provider bootstrap session.`,
      );
      return {
        kind: "needs_provider",
        init,
        models,
      };
    }
  }

  const preview = models.slice(0, 2).map(formatModelLabel).join(", ");
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
  log(
    `Found ${models.length} available model${models.length === 1 ? "" : "s"}${preview ? `: ${preview}` : ""}.`,
  );
  ensureCodingModelPolicy(workspace, models, log);
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

function canLaunchProviderBootstrap(): boolean {
  return stdin.isTTY && stdout.isTTY;
}

function formatModelLabel(model: SetupModelView): string {
  return `${model.provider}/${model.id}`;
}

function ensureCodingModelPolicy(
  workspace: string,
  models: SetupModelView[],
  log: (line: string) => void,
): void {
  const paths = createWorkspacePaths(workspace);
  if (!existsSync(paths.primaryConfigPath) || models.length === 0) return;

  const raw = readJsonFileStrict(
    paths.primaryConfigPath,
    (parsed) => parsed as Record<string, unknown>,
  );
  const policies = isRecord(raw.modelPolicies)
    ? { ...raw.modelPolicies }
    : {};
  const first = models[0];
  if (!first) return;
  let changed = false;

  if (!isRecord(policies[DEFAULT_MODEL_POLICY])) {
    policies[DEFAULT_MODEL_POLICY] = {
      candidates: [{ provider: first.provider, id: first.id }],
    };
    raw.modelPolicies = policies;
    changed = true;
    log(`Created ${DEFAULT_MODEL_POLICY} model policy from ${formatModelLabel(first)}.`);
  }

  if (Array.isArray(raw.agents)) {
    const agents = raw.agents.map((entry) => {
      if (!isRecord(entry) || entry.id !== "shrimpy" || entry.modelPolicy !== undefined) {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        modelPolicy: DEFAULT_MODEL_POLICY,
      };
    });
    raw.agents = agents;
  }

  if (changed) writeJsonFileAtomic(paths.primaryConfigPath, raw);
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
