import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  type AuthEvent,
  type AuthInteraction,
  type AuthPrompt,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createWorkspacePaths } from "../workspace/paths.js";
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

export async function listAvailableSetupModels(workspace: string): Promise<SetupModelView[]> {
  try {
    const modelRuntime = await createSetupModelRuntime(workspace);
    return (await modelRuntime.getAvailable()).map((model: SetupModelCandidate) => ({
      provider: typeof model.provider === "string" ? model.provider : "unknown",
      id: typeof model.id === "string" ? model.id : "unknown",
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
  const modelRuntime = await createSetupModelRuntime(input.workspace);
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
      modelRuntime,
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
  modelRuntime: ModelRuntime;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
  secret: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { modelRuntime, log, question, secret } = input;

  while (modelRuntime.getAvailableSnapshot().length === 0) {
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
      await refreshSetupModels(modelRuntime, log, { allowNetwork: true, force: true });
      if (modelRuntime.getAvailableSnapshot().length === 0) {
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

    await refreshSetupModels(modelRuntime, log, { allowNetwork: false });
    if (modelRuntime.getAvailableSnapshot().length === 0) {
      log("");
      log("No available models found yet.");
    }
  }
}

async function configureLocalProvider(input: {
  workspace: string;
  modelRuntime: ModelRuntime;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { modelRuntime, log, question } = input;
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

  await refreshSetupModels(modelRuntime, log, { allowNetwork: false });
  const available = modelRuntime.getAvailableSnapshot().filter((model) =>
    model.provider === result.provider && model.id === result.modelId
  );
  if (available.length === 0) {
    log(`Saved local model ${result.provider}/${result.modelId}, but it is not available yet.`);
    return;
  }
  log(`Saved local model ${result.provider}/${result.modelId}.`);
}

async function configureApiKeyProvider(input: {
  modelRuntime: ModelRuntime;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
  secret: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { modelRuntime, log, question, secret } = input;
  const provider = await promptChoice({
    title: "Choose an API-key provider.",
    options: listApiKeyProviderOptions(modelRuntime),
    question,
    log,
  });
  if (!provider) return;

  try {
    await modelRuntime.login(
      provider.id,
      "api_key",
      createAuthInteraction({ question, secret, log }),
    );
  } catch (err) {
    log(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const available = modelRuntime.getAvailableSnapshot().filter(
    (model) => model.provider === provider.id,
  );
  if (available.length === 0) {
    log(`Saved API key for ${provider.name}, but no models are available for that provider.`);
    return;
  }

  log(`Saved API key for ${provider.name}.`);
}

async function configureOAuthProvider(input: {
  modelRuntime: ModelRuntime;
  log: (line: string) => void;
  question: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { modelRuntime, log, question } = input;
  const provider = await promptChoice({
    title: "Choose a subscription provider.",
    options: listOAuthProviderOptions(modelRuntime),
    question,
    log,
  });
  if (!provider) return;

  try {
    await modelRuntime.login(
      provider.id,
      "oauth",
      createAuthInteraction({ question, secret: question, log }),
    );
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
  if (answer) return answer;
  return (fallback ?? "") || undefined;
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

function listApiKeyProviderOptions(modelRuntime: ModelRuntime): AuthProviderOption[] {
  return modelRuntime.getProviders()
    .filter((provider) =>
      Object.prototype.hasOwnProperty.call(provider.auth.apiKey ?? {}, "login")
    )
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
    }))
    .sort(compareProviderOptions);
}

function listOAuthProviderOptions(modelRuntime: ModelRuntime): AuthProviderOption[] {
  return modelRuntime.getProviders()
    .filter((provider) => Boolean(provider.auth.oauth))
    .map((provider) => ({
      id: provider.id,
      name: provider.auth.oauth?.loginLabel ??
        provider.auth.oauth?.name ??
        provider.name,
    }))
    .sort(compareProviderOptions);
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
  signal?: AbortSignal;
}): Promise<T | undefined> {
  const { title, options, question, log, signal } = input;
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
    const answer = (await questionWithSignal(
      question,
      "Choose [1]: ",
      signal,
    )).trim();
    const index = answer ? Number(answer) - 1 : 0;
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      return options[index];
    }
    log(`Enter a number from 1 to ${options.length}.`);
  }
}

function createAuthInteraction(input: {
  question: (prompt: string) => Promise<string>;
  secret: (prompt: string) => Promise<string>;
  log: (line: string) => void;
}): AuthInteraction {
  return {
    prompt: (prompt) => promptAuthValue(prompt, input),
    notify: (event) => notifyAuthEvent(event, input.log),
  };
}

async function promptAuthValue(
  prompt: AuthPrompt,
  input: {
    question: (prompt: string) => Promise<string>;
    secret: (prompt: string) => Promise<string>;
    log: (line: string) => void;
  },
): Promise<string> {
  if (prompt.signal?.aborted) throw new Error("Login prompt was cancelled.");
  if (prompt.type === "select") {
    const selected = await promptChoice({
      title: prompt.message,
      options: prompt.options.map((option) => ({
        id: option.id,
        name: option.description
          ? `${option.label} — ${option.description}`
          : option.label,
      })),
      question: input.question,
      log: input.log,
      signal: prompt.signal,
    });
    if (!selected) throw new Error("Login prompt was cancelled.");
    return selected.id;
  }

  const placeholder = prompt.placeholder ? ` (${prompt.placeholder})` : "";
  const ask = prompt.type === "secret" ? input.secret : input.question;
  return questionWithSignal(
    ask,
    `${prompt.message}${placeholder}: `,
    prompt.signal,
  );
}

async function questionWithSignal(
  question: (prompt: string) => Promise<string>,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!signal) return question(prompt);
  if (signal.aborted) throw new Error("Login prompt was cancelled.");

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error("Login prompt was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void question(prompt).then(
      (answer) => {
        signal.removeEventListener("abort", onAbort);
        resolve(answer);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function notifyAuthEvent(event: AuthEvent, log: (line: string) => void): void {
  if (event.type === "info") {
    log(event.message);
    for (const link of event.links ?? []) {
      log(link.label ? `${link.label}: ${link.url}` : link.url);
    }
    return;
  }
  if (event.type === "auth_url") {
    log("");
    if (event.instructions) log(event.instructions);
    log(event.url);
    return;
  }
  if (event.type === "device_code") {
    log("");
    log(`Open: ${event.verificationUri}`);
    log(`Code: ${event.userCode}`);
    return;
  }
  log(event.message);
}

async function createSetupModelRuntime(workspace: string): Promise<ModelRuntime> {
  const paths = createWorkspacePaths(workspace);
  return ModelRuntime.create({
    authPath: paths.authPath,
    modelsPath: paths.modelsPath,
    modelsStorePath: paths.modelsStorePath,
    allowModelNetwork: false,
  });
}

async function refreshSetupModels(
  modelRuntime: ModelRuntime,
  log: (line: string) => void,
  options: { allowNetwork: boolean; force?: boolean },
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const result = await modelRuntime.refresh({
      ...options,
      signal: controller.signal,
    });
    for (const [providerId, error] of result.errors) {
      log(`Could not refresh ${providerId}: ${error.message}`);
    }
    if (result.aborted) log("Model refresh timed out.");
  } finally {
    clearTimeout(timeout);
  }
}
