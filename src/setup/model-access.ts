import { stdin, stdout } from "node:process";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  createAppRuntime,
  createWorkspacePaths,
} from "../app/index.js";
import {
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  runPiInteractiveAgentSession,
} from "../sessions/index.js";
import {
  readJsonFileStrict,
} from "../util/json-file.js";

export interface SetupModelView {
  provider: string;
  id: string;
  name?: string;
}

export interface ModelAccessOnboardingInput {
  config: ShrimpyConfig;
  cwd?: string;
}

interface SetupModelCandidate {
  provider?: unknown;
  id?: unknown;
  name?: unknown;
}

export function canRunInteractiveModelOnboarding(): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY);
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

export async function launchModelAccessOnboarding(
  input: ModelAccessOnboardingInput,
): Promise<void> {
  const runtime = createAppRuntime(input.config);
  await runPiInteractiveAgentSession({
    runtime,
    agentId: "shrimpy",
    channel: "setup-model",
    sessionType: "tui",
    allowMissingModel: true,
    cwd: input.cwd,
  });
}

export function loadConfigForModelAccessOnboarding(
  workspace: string,
  log: (line: string) => void,
): ShrimpyConfig {
  try {
    return loadConfigForWorkspace(workspace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const paths = createWorkspacePaths(workspace);
    const raw = readJsonFileStrict(
      paths.primaryConfigPath,
      (parsed) => parsed as Record<string, unknown>,
    );
    if (raw.modelPolicies === undefined) throw err;
    const { modelPolicies: _modelPolicies, ...withoutModelPolicies } = raw;
    log(`Model policy config is not valid yet: ${message}`);
    log("Starting model onboarding without model policy resolution.");
    return {
      ...withoutModelPolicies,
      workspace,
    } as ShrimpyConfig;
  }
}
