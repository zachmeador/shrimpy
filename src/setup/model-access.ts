import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  getProviders,
  type OAuthPrompt,
  type OAuthSelectPrompt,
} from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  createWorkspacePaths,
} from "../app/index.js";
import { BUILT_IN_PROVIDER_DISPLAY_NAMES } from "../app/pi-internals.js";
import {
  addOpenAICompatibleModel,
  DEFAULT_LOCAL_CONTEXT_WINDOW,
  DEFAULT_LOCAL_ENDPOINT,
  DEFAULT_LOCAL_MAX_TOKENS,
  DEFAULT_LOCAL_PROVIDER,
} from "./pi-model-registry.js";
import { isRecord } from "../util/record.js";

export interface SetupModelView {
  provider: string;
  id: string;
  name?: string;
}

export interface ModelAccessOnboardingInput {
  workspace: string;
  cwd?: string;
}

interface ModelAccessOnboardingDeps {
  log?: (line: string) => void;
  question?: (prompt: string) => Promise<string>;
  secret?: (prompt: string) => Promise<string>;
}

interface SetupModelCandidate {
  provider?: unknown;
  id?: unknown;
  name?: unknown;
}

interface AuthProviderOption {
  id: string;
  name: string;
}

const API_KEY_PROVIDER_PRIORITY = [
  "anthropic",
  "openai",
  "openrouter",
  "google",
  "github-copilot",
  "mistral",
  "deepseek",
];

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
  deps: ModelAccessOnboardingDeps = {},
): Promise<void> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const paths = createWorkspacePaths(input.workspace);
  const authStorage = AuthStorage.create(paths.authPath);
  const registry = ModelRegistry.create(authStorage, paths.modelsPath);
  const rl = deps.question
    ? undefined
    : createInterface({ input: stdin, output: stdout });
  const question = deps.question ?? ((prompt: string) => rl!.question(prompt));
  const secret = deps.secret ?? question;

  try {
    log("");
    log("Model access setup");
    log("");
    await runModelAccessWizard({
      workspace: input.workspace,
      authStorage,
      registry,
      log,
      question,
      secret,
    });
  } finally {
    rl?.close();
  }
}

async function runModelAccessWizard(input: {
  workspace: string;
  authStorage: AuthStorage;
  registry: ModelRegistry;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
  secret: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { registry, log, question, secret } = input;

  while (registry.getAvailable().length === 0) {
    const action = await promptChoice({
      title: "Choose how to configure model access.",
      options: [
        { id: "local", name: "Use a local endpoint" },
        { id: "api_key", name: "Enter an API key" },
        { id: "oauth", name: "Use a subscription login" },
        { id: "refresh", name: "I configured auth another way" },
        { id: "cancel", name: "Cancel setup" },
      ],
      question,
      log,
    });

    if (!action || action.id === "cancel") return;
    if (action.id === "refresh") {
      registry.refresh();
      if (registry.getAvailable().length === 0) {
        log("No available models found after refresh.");
      }
      continue;
    }

    if (action.id === "local") {
      await configureLocalProvider(input);
    } else if (action.id === "api_key") {
      await configureApiKeyProvider({ ...input, secret });
    } else if (action.id === "oauth") {
      await configureOAuthProvider(input);
    }

    registry.refresh();
    if (registry.getAvailable().length === 0) {
      log("");
      log("No available models found yet.");
    }
  }
}

async function configureLocalProvider(input: {
  workspace: string;
  registry: ModelRegistry;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { registry, log, question } = input;
  log("");
  log("Configure a local OpenAI-compatible endpoint.");

  const endpoint = await promptWithDefault(
    question,
    "Endpoint",
    DEFAULT_LOCAL_ENDPOINT,
  );
  const provider = await promptWithDefault(
    question,
    "Provider id",
    DEFAULT_LOCAL_PROVIDER,
  );
  const discovered = await discoverOpenAICompatibleModels(endpoint);
  if (discovered.length > 0) {
    log(`Found ${discovered.length} endpoint model${discovered.length === 1 ? "" : "s"}.`);
  }

  const selected = discovered.length > 0
    ? await promptChoice({
      title: "Choose a local model.",
      options: discovered.map((id) => ({ id, name: id })),
      question,
      log,
    })
    : undefined;
  const modelId = selected?.id ?? (await question("Model id: ")).trim();
  if (!modelId) {
    log("No model id entered.");
    return;
  }

  const defaultName = `${modelId} (local)`;
  const name = await promptOptional(question, `Display name [${defaultName}]: `, defaultName);
  const contextWindow = await promptIntegerWithDefault(
    question,
    "Context window",
    DEFAULT_LOCAL_CONTEXT_WINDOW,
  );
  const maxTokens = await promptIntegerWithDefault(
    question,
    "Max output tokens",
    DEFAULT_LOCAL_MAX_TOKENS,
  );

  const result = addOpenAICompatibleModel({
    workspace: input.workspace,
    provider,
    endpoint,
    modelId,
    name,
    contextWindow,
    maxTokens,
  });

  registry.refresh();
  const available = registry.getAvailable().filter((model) =>
    model.provider === result.provider && model.id === result.modelId
  );
  if (available.length === 0) {
    log(`Saved local model ${result.provider}/${result.modelId}, but it is not available yet.`);
    return;
  }
  log(`Saved local model ${result.provider}/${result.modelId}.`);
}

async function configureApiKeyProvider(input: {
  authStorage: AuthStorage;
  registry: ModelRegistry;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
  secret: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { authStorage, registry, log, question, secret } = input;
  const provider = await promptChoice({
    title: "Choose an API-key provider.",
    options: listApiKeyProviderOptions(registry),
    question,
    log,
  });
  if (!provider) return;

  const apiKey = (await secret(`Paste ${provider.name} API key: `)).trim();
  if (!apiKey) {
    log("No API key entered.");
    return;
  }

  authStorage.set(provider.id, { type: "api_key", key: apiKey });
  registry.refresh();

  const available = registry.getAvailable().filter((model) => model.provider === provider.id);
  if (available.length === 0) {
    log(`Saved API key for ${provider.name}, but no models are available for that provider.`);
    return;
  }

  log(`Saved API key for ${provider.name}.`);
}

async function configureOAuthProvider(input: {
  authStorage: AuthStorage;
  registry: ModelRegistry;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { authStorage, registry, log, question } = input;
  const provider = await promptChoice({
    title: "Choose a subscription provider.",
    options: authStorage.getOAuthProviders().map((entry) => ({
      id: entry.id,
      name: entry.name,
    })),
    question,
    log,
  });
  if (!provider) return;

  try {
    await authStorage.login(provider.id, {
      onAuth: (info) => {
        log("");
        if (info.instructions) log(info.instructions);
        log(info.url);
      },
      onDeviceCode: (info) => {
        log("");
        log(`Open: ${info.verificationUri}`);
        log(`Code: ${info.userCode}`);
      },
      onPrompt: (prompt) => promptOAuthValue(prompt, question),
      onProgress: (message) => {
        log(message);
      },
      onSelect: (prompt) => promptOAuthSelection(prompt, question, log),
    });
    registry.refresh();
    log(`Saved subscription login for ${provider.name}.`);
  } catch (err) {
    log(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function discoverOpenAICompatibleModels(endpoint: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/, "")}/models`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json() as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
    return payload.data
      .map((entry) => isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function promptWithDefault(
  question: (prompt: string) => Promise<string>,
  label: string,
  fallback: string,
): Promise<string> {
  const answer = (await question(`${label} [${fallback}]: `)).trim();
  return answer || fallback;
}

async function promptOptional(
  question: (prompt: string) => Promise<string>,
  prompt: string,
  fallback?: string,
): Promise<string | undefined> {
  const answer = (await question(prompt)).trim();
  return answer || fallback || undefined;
}

async function promptIntegerWithDefault(
  question: (prompt: string) => Promise<string>,
  label: string,
  fallback: number,
): Promise<number> {
  while (true) {
    const answer = (await question(`${label} [${fallback}]: `)).trim();
    if (!answer) return fallback;
    const parsed = Number(answer);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
}

function listApiKeyProviderOptions(registry: ModelRegistry): AuthProviderOption[] {
  const oauthProviderIds = new Set(
    registry.authStorage.getOAuthProviders().map((provider) => provider.id),
  );
  const builtInProviderIds = new Set(getProviders());
  const providerIds = new Set(
    registry.getAll()
      .map((model) => model.provider)
      .filter((provider) =>
        isApiKeyLoginProvider(provider, oauthProviderIds, builtInProviderIds)
      ),
  );

  return [...providerIds].map((id) => ({
    id,
    name: apiKeyProviderDisplayName(registry, id),
  })).sort(compareProviderOptions);
}

function isApiKeyLoginProvider(
  providerId: string,
  oauthProviderIds: ReadonlySet<string>,
  builtInProviderIds: ReadonlySet<string>,
): boolean {
  if (BUILT_IN_PROVIDER_DISPLAY_NAMES[providerId]) return true;
  if (builtInProviderIds.has(providerId)) return false;
  return !oauthProviderIds.has(providerId);
}

function apiKeyProviderDisplayName(registry: ModelRegistry, providerId: string): string {
  return BUILT_IN_PROVIDER_DISPLAY_NAMES[providerId] ??
    registry.getProviderDisplayName(providerId);
}

function compareProviderOptions(left: AuthProviderOption, right: AuthProviderOption): number {
  const leftPriority = API_KEY_PROVIDER_PRIORITY.indexOf(left.id);
  const rightPriority = API_KEY_PROVIDER_PRIORITY.indexOf(right.id);
  if (leftPriority >= 0 || rightPriority >= 0) {
    return (leftPriority >= 0 ? leftPriority : Number.MAX_SAFE_INTEGER) -
      (rightPriority >= 0 ? rightPriority : Number.MAX_SAFE_INTEGER);
  }
  return left.name.localeCompare(right.name);
}

async function promptChoice<T extends AuthProviderOption>(input: {
  title: string;
  options: T[];
  question: (prompt: string) => Promise<string>;
  log: (line: string) => void;
}): Promise<T | undefined> {
  const { title, options, question, log } = input;
  if (options.length === 0) {
    log("No options available.");
    return undefined;
  }

  log("");
  log(title);
  options.forEach((option, index) => {
    log(`  ${index + 1}. ${option.name}`);
  });

  while (true) {
    const answer = (await question("Choose [1]: ")).trim();
    const index = answer ? Number(answer) - 1 : 0;
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      return options[index];
    }
    log(`Enter a number from 1 to ${options.length}.`);
  }
}

async function promptOAuthValue(
  prompt: OAuthPrompt,
  question: (prompt: string) => Promise<string>,
): Promise<string> {
  while (true) {
    const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : "";
    const answer = await question(`${prompt.message}${placeholder}: `);
    if (answer || prompt.allowEmpty) return answer;
  }
}

async function promptOAuthSelection(
  prompt: OAuthSelectPrompt,
  question: (prompt: string) => Promise<string>,
  log: (line: string) => void,
): Promise<string | undefined> {
  const selected = await promptChoice({
    title: prompt.message,
    options: prompt.options.map((option) => ({
      id: option.id,
      name: option.label,
    })),
    question,
    log,
  });
  return selected?.id;
}
