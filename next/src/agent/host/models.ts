import {
  type AuthContext,
  createModels,
  createProvider,
  type Models,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { ModelRef } from "@earendil-works/pi-durable";
import { readCredentials } from "./credentials.ts";
import { type CustomApi, type CustomProvider, readCustomProviders } from "./custom-providers.ts";

export interface ModelRuntimeOptions {
  /** The home's models.json: providers it declares. */
  readonly modelsFile: string;
  /** The home's auth.json: keys for providers. */
  readonly authFile: string;
  /** The model the agent starts with. It must be usable, or this fails. */
  readonly model: ModelRef;
}

/** The model the home names cannot be used, and what to do about it. */
export class ModelSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelSetupError";
  }
}

/**
 * Keys come from the home's files only. The process environment and files such
 * as ~/.aws would give every home on the machine the same credentials by accident.
 */
const HOME_ONLY: AuthContext = {
  env: () => Promise.resolve(undefined),
  fileExists: () => Promise.resolve(false),
};

const STREAMS: Record<CustomApi, () => ProviderStreams> = {
  "openai-completions": openAICompletionsApi,
};

const LISTED_MODELS = 12;

/**
 * The model runtime for one home: Pi's built-in providers with the keys in
 * auth.json, plus the providers that models.json declares. A provider that
 * models.json declares replaces a built-in one with the same ID. Fails with a
 * message that says what to change if the home's default model is unusable.
 */
export async function buildModels(options: ModelRuntimeOptions): Promise<Models> {
  const models = createModels({ credentials: readCredentials(options.authFile), authContext: HOME_ONLY });
  // Loaded here because it brings in every provider's model list.
  const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
  const builtin = builtinProviders();
  for (const provider of builtin) models.setProvider(provider);
  const custom = readCustomProviders(options.modelsFile);
  for (const provider of custom) models.setProvider(customProvider(provider));
  await requireUsable(models, options, new Set(custom.map(({ id }) => id)));
  return models;
}

function customProvider(spec: CustomProvider): Provider {
  return createProvider({
    id: spec.id,
    baseUrl: spec.baseUrl,
    auth: {
      apiKey: {
        name: `${spec.id} API key`,
        resolve: ({ credential }) => {
          const stored = credential?.key;
          const key = stored ?? spec.apiKey;
          if (key === undefined) return Promise.resolve(undefined);
          return Promise.resolve({
            auth: { apiKey: key },
            source: stored === undefined ? "models.json" : "auth.json",
          });
        },
      },
    },
    models: spec.models,
    api: STREAMS[spec.api](),
  });
}

async function requireUsable(models: Models, options: ModelRuntimeOptions, custom: Set<string>): Promise<void> {
  const { provider: providerId, modelId } = options.model;
  const provider = models.getProvider(providerId);
  if (provider === undefined) {
    const declared = [...custom].join(", ") || "none";
    const builtin = models
      .getProviders()
      .map(({ id }) => id)
      .filter((id) => !custom.has(id))
      .sort()
      .join(", ");
    throw new ModelSetupError(
      `The model ${providerId}/${modelId} names the provider "${providerId}", which is not declared in ${options.modelsFile} ` +
        `(declared there: ${declared}) and is not built in (built in: ${builtin}).`,
    );
  }
  if (models.getModel(providerId, modelId) === undefined) {
    const ids = models.getModels(providerId).map(({ id }) => id);
    const shown = ids.slice(0, LISTED_MODELS).join(", ");
    const more = ids.length > LISTED_MODELS ? ` and ${ids.length - LISTED_MODELS} more` : "";
    const where = custom.has(providerId) ? ` Add it under providers.${providerId}.models in ${options.modelsFile}.` : "";
    throw new ModelSetupError(`The provider "${providerId}" has no model "${modelId}". It has: ${shown}${more}.${where}`);
  }
  if ((await models.checkAuth(providerId)) !== undefined) return;
  throw new ModelSetupError(missingKey(provider, custom.has(providerId), options));
}

function missingKey(provider: Provider, isCustom: boolean, options: ModelRuntimeOptions): string {
  const id = provider.id;
  if (isCustom) {
    return (
      `The provider "${id}" has no API key. A server that needs none still takes a placeholder: ` +
      `set "apiKey": "local" under providers.${id} in ${options.modelsFile}.`
    );
  }
  if (provider.auth.apiKey === undefined) {
    return `The provider "${id}" signs in with OAuth, which this build cannot do yet.`;
  }
  const entry = JSON.stringify({ [id]: { type: "api_key", key: "<your key>" } });
  return `The provider "${id}" has no API key. Add one to ${options.authFile}, for example ${entry}`;
}
