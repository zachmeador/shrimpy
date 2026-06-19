import {
  existsSync,
  readFileSync,
} from "node:fs";
import { createWorkspacePaths } from "../app/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import { editConfigFile } from "../config/store.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import { isRecord } from "../util/record.js";

export const DEFAULT_LOCAL_PROVIDER = "local";
export const DEFAULT_LOCAL_ENDPOINT = "http://localhost:11434/v1";
export const DEFAULT_LOCAL_CONTEXT_WINDOW = 128000;
export const DEFAULT_LOCAL_MAX_TOKENS = 8192;

const ZERO_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export interface AddOpenAICompatibleModelInput {
  workspace: string;
  provider?: string;
  endpoint?: string;
  modelId: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  thinkingFormat?: string;
  setCoding?: boolean;
}

export interface AddOpenAICompatibleModelResult {
  provider: string;
  modelId: string;
  endpoint: string;
  modelsPath: string;
  configPath?: string;
  setCoding: boolean;
}

export function addOpenAICompatibleModel(
  input: AddOpenAICompatibleModelInput,
): AddOpenAICompatibleModelResult {
  const paths = createWorkspacePaths(input.workspace);
  const provider = normalizeIdentifier(input.provider ?? DEFAULT_LOCAL_PROVIDER, "provider");
  const modelId = normalizeIdentifier(input.modelId, "model id");
  const endpoint = normalizeEndpoint(input.endpoint ?? DEFAULT_LOCAL_ENDPOINT);
  const contextWindow = input.contextWindow ?? DEFAULT_LOCAL_CONTEXT_WINDOW;
  const maxTokens = input.maxTokens ?? DEFAULT_LOCAL_MAX_TOKENS;
  const thinkingFormat = input.thinkingFormat === undefined
    ? undefined
    : normalizeIdentifier(input.thinkingFormat, "thinking format");
  validatePositiveInteger(contextWindow, "contextWindow");
  validatePositiveInteger(maxTokens, "maxTokens");
  if (input.setCoding && !existsSync(paths.primaryConfigPath)) {
    throw new Error(`config not found: ${paths.primaryConfigPath}. Run "shrimpy setup" first.`);
  }

  const raw = readModelsConfig(paths.modelsPath);
  const providers = isRecord(raw.providers) ? { ...raw.providers } : {};
  const existingProvider = isRecord(providers[provider])
    ? { ...providers[provider] }
    : {};
  const models = Array.isArray(existingProvider.models)
    ? existingProvider.models.filter((entry) => !(isRecord(entry) && entry.id === modelId))
    : [];

  models.push(createOpenAICompatibleModelEntry({
    modelId,
    name: input.name,
    contextWindow,
    maxTokens,
  }));

  providers[provider] = {
    ...existingProvider,
    baseUrl: endpoint,
    apiKey: "local",
    api: "openai-completions",
    compat: buildOpenAICompatibleCompat(existingProvider.compat, thinkingFormat),
    models,
  };
  raw.providers = providers;
  writeJsonFileAtomic(paths.modelsPath, raw);

  let configPath: string | undefined;
  if (input.setCoding) {
    const edited = editConfigFile(input.workspace, (config) => {
      const policies = isRecord(config.modelPolicies)
        ? { ...config.modelPolicies }
        : {};
      policies[DEFAULT_MODEL_POLICY] = {
        candidates: [{ provider, id: modelId }],
      };
      config.modelPolicies = policies;
    }, { missing: "error" });
    configPath = edited.configPath;
  }

  return {
    provider,
    modelId,
    endpoint,
    modelsPath: paths.modelsPath,
    configPath,
    setCoding: Boolean(input.setCoding),
  };
}

function createOpenAICompatibleModelEntry(input: {
  modelId: string;
  name?: string;
  contextWindow: number;
  maxTokens: number;
}): Record<string, unknown> {
  return {
    id: input.modelId,
    ...(input.name ? { name: input.name } : {}),
    reasoning: false,
    input: ["text"],
    cost: ZERO_COST,
    contextWindow: input.contextWindow,
    maxTokens: input.maxTokens,
  };
}

function buildOpenAICompatibleCompat(
  raw: unknown,
  thinkingFormat: string | undefined,
): Record<string, unknown> {
  return {
    ...(isRecord(raw) ? raw : {}),
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    ...(thinkingFormat ? { thinkingFormat } : {}),
  };
}

function readModelsConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf-8"))) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`models.json must be an object: ${path}`);
  }
  return parsed;
}

function stripJsonComments(input: string): string {
  return input
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => match[0] === "\"" ? match : "")
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail: string | undefined) =>
      tail ?? (match[0] === "\"" ? match : "")
    );
}

function normalizeIdentifier(raw: string, label: string): string {
  const value = raw.trim();
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function normalizeEndpoint(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) throw new Error("endpoint is required");
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`endpoint must be http or https: ${raw}`);
  }
  return value;
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}
