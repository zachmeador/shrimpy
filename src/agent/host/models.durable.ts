import {
  createModels,
  createProvider,
  type Models,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { ModelRef } from "@earendil-works/pi-durable";
import { type ProviderPaths, providerPaths, readDefaultModel } from "../home/index.ts";
import { credentialStore, NO_AMBIENT_AUTH } from "./credentials.ts";
import { type CustomApi, type CustomProvider, readCustomProviders } from "./custom-providers.ts";

export interface ModelRuntimeOptions {
  /** The home's models.json: providers it declares. */
  readonly modelsFile: string;
  /** The home's auth.json: keys and sign-ins for providers. */
  readonly authFile: string;
  /** The home's agent.json, which the messages name when the model is to be named there. */
  readonly configFile: string;
  /**
   * The folder's `providers/` directory, when the agent was told of one: what
   * the home doesn't declare or hold comes from its models.json and auth.json,
   * and a model its agent.json doesn't name from its default-model.json.
   * Without it the agent has only what its home holds. The agent is told where
   * it is and never looks for it.
   */
  readonly providers?: string;
  /** The model the home's agent.json names, if it names one. */
  readonly model?: ModelRef;
}

/** The model runtime, and the model the agent starts with. */
export interface ModelRuntime {
  readonly models: Models;
  readonly model: ModelRef;
}

/** The agent has no model to start with, or the one it has cannot be used, and what to do about it. */
export class ModelSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelSetupError";
  }
}

const STREAMS: Record<CustomApi, () => ProviderStreams> = {
  "openai-completions": openAICompletionsApi,
};

const LISTED_MODELS = 12;

/** The files a person changes to make a model usable: the home's, and the folder's when the agent was told of one. */
interface Files {
  readonly models: readonly string[];
  /** The home's auth.json, then the folder's. */
  readonly auth: readonly [string, ...string[]];
}

/** The providers that models.json files declare, each with the file it is declared in. */
type Declared = ReadonlyMap<string, { readonly provider: CustomProvider; readonly file: string }>;

const either = (files: readonly string[]): string => files.join(" or ");

/** The model an agent starts with, and the file that names it. */
interface Start {
  readonly model: ModelRef;
  readonly file: string;
}

const EXAMPLE_MODEL = '{"provider": "local", "id": "qwen3.8-27b"}';

/** The model its agent.json names, or else the folder's default. With neither the agent has none, and the error says what to do. */
function startingModel(options: ModelRuntimeOptions, folder: ProviderPaths | undefined): Start {
  const { configFile } = options;
  if (options.model !== undefined) return { model: options.model, file: configFile };
  if (folder !== undefined) {
    const fallback = readDefaultModel(folder.defaultModel);
    if (fallback !== undefined) {
      return { model: { provider: fallback.provider, modelId: fallback.id }, file: folder.defaultModel };
    }
  }
  const named = `Name one in ${configFile}, as "model": ${EXAMPLE_MODEL}`;
  throw new ModelSetupError(
    folder === undefined
      ? `The agent has no model to start with: ${configFile} names none. ${named}.`
      : `The agent has no model to start with: ${configFile} names none, and ${folder.defaultModel} is not there. ` +
          `${named}, or put ${EXAMPLE_MODEL} in ${folder.defaultModel} for every agent that names none.`,
  );
}

/**
 * The model runtime for one home: Pi's built-in providers with the keys and
 * sign-ins in the auth.json files, plus the providers that the models.json files
 * declare. The home's file comes first in each pair: it is the one used for a
 * provider it holds an entry for or declares, and a provider the home declares
 * takes its key from the home alone. A provider that models.json declares
 * replaces a built-in one with the same ID. The model the agent starts
 * with is the one its agent.json names, or else the folder's default. Fails
 * with a message that says what to change if there is none, or it is unusable.
 */
export async function buildModels(options: ModelRuntimeOptions): Promise<ModelRuntime> {
  const folder = options.providers === undefined ? undefined : providerPaths(options.providers);
  const start = startingModel(options, folder);
  const files: Files = {
    models: folder === undefined ? [options.modelsFile] : [options.modelsFile, folder.models],
    auth: folder === undefined ? [options.authFile] : [options.authFile, folder.auth],
  };
  const declared = new Map<string, { provider: CustomProvider; file: string }>();
  for (const file of files.models) {
    for (const provider of readCustomProviders(file)) {
      if (!declared.has(provider.id)) declared.set(provider.id, { provider, file });
    }
  }
  // A provider the home declares is the home's whole: its server takes no key that the folder holds for that name.
  const own = new Set([...declared].filter(([, { file }]) => file === options.modelsFile).map(([id]) => id));
  const credentials = credentialStore(
    options.authFile,
    folder === undefined ? undefined : { file: folder.auth, except: own },
  );
  // A file that doesn't fit stops the start here, naming itself, and not at the first request.
  await credentials.list();
  const models = createModels({ credentials, authContext: NO_AMBIENT_AUTH });
  // Loaded here because it brings in every provider's model list.
  const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
  for (const provider of builtinProviders()) models.setProvider(provider);
  for (const { provider } of declared.values()) models.setProvider(customProvider(provider));
  await requireUsable(models, start, declared, files);
  return { models, model: start.model };
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

async function requireUsable(models: Models, start: Start, declared: Declared, files: Files): Promise<void> {
  const { provider: providerId, modelId } = start.model;
  const provider = models.getProvider(providerId);
  if (provider === undefined) {
    const declaredIds = [...declared.keys()].join(", ") || "none";
    const builtin = models
      .getProviders()
      .map(({ id }) => id)
      .filter((id) => !declared.has(id))
      .sort()
      .join(", ");
    throw new ModelSetupError(
      `The model ${providerId}/${modelId}, named in ${start.file}, names the provider "${providerId}", ` +
        `which is not declared in ${either(files.models)} (declared there: ${declaredIds}) ` +
        `and is not built in (built in: ${builtin}).`,
    );
  }
  const declaredIn = declared.get(providerId)?.file;
  if (models.getModel(providerId, modelId) === undefined) {
    const ids = models.getModels(providerId).map(({ id }) => id);
    const shown = ids.slice(0, LISTED_MODELS).join(", ");
    const more = ids.length > LISTED_MODELS ? ` and ${ids.length - LISTED_MODELS} more` : "";
    const fix =
      declaredIn === undefined
        ? `Correct the model in ${start.file}.`
        : `Add it under providers.${providerId}.models in ${declaredIn}, or correct the model in ${start.file}.`;
    throw new ModelSetupError(`The provider "${providerId}" has no model "${modelId}". It has: ${shown}${more}. ${fix}`);
  }
  if ((await models.checkAuth(providerId)) !== undefined) return;
  throw new ModelSetupError(missingKey(provider, declaredIn, files));
}

function missingKey(provider: Provider, declaredIn: string | undefined, files: Files): string {
  const id = provider.id;
  if (declaredIn !== undefined) {
    return (
      `The provider "${id}" has no API key. A server that needs none still takes a placeholder: ` +
      `set "apiKey": "local" under providers.${id} in ${declaredIn}.`
    );
  }
  const [own, folder] = files.auth;
  if (provider.auth.apiKey === undefined) {
    // Only a sign-in will do. An agent that was told of no folder has only its own file to look in, which a command doesn't write.
    return folder === undefined
      ? `The provider "${id}" signs in with an account, and ${own} holds no sign-in for it. ` +
          'An entry with "type": "oauth" there is used, and renewed when its token runs out.'
      : `The provider "${id}" signs in with an account, and no sign-in for it is in ${own} or ${folder}. ` +
          `Run shrimpy providers login ${id} to sign in, for every agent in the Shrimpy folder.`;
  }
  const entry = JSON.stringify({ [id]: { type: "api_key", key: "<your key>" } });
  if (folder === undefined) return `The provider "${id}" has no API key. Add one to ${own}, for example ${entry}`;
  const verb = provider.auth.oauth === undefined ? "add a key" : "sign in or add a key";
  return (
    `The provider "${id}" has no API key. Run shrimpy providers login ${id} to ${verb}, which keeps it in ${folder} ` +
    `for every agent in the Shrimpy folder, or put a key in ${own} for this agent alone, for example ${entry}`
  );
}
