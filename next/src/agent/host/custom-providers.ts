import type { Model, OpenAICompletionsCompat } from "@earendil-works/pi-ai";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { checkKeyAsWritten } from "./credentials.ts";

/** The API types a custom provider can speak. */
const CUSTOM_APIS = ["openai-completions"] as const;
export type CustomApi = (typeof CUSTOM_APIS)[number];

/** A provider that models.json declares: an OpenAI-compatible server and the models it serves. */
export interface CustomProvider {
  readonly id: string;
  readonly baseUrl: string;
  readonly api: CustomApi;
  /** The key to send when auth.json holds none for this provider. A local server takes a placeholder. */
  readonly apiKey: string | undefined;
  readonly models: readonly Model<"openai-completions">[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const FREE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Read the providers a home declares in models.json. A missing file declares
 * none. The file follows Pi's `models.json`, limited to the keys read below;
 * any other key is an error rather than being ignored. Compat flags for
 * servers that differ from OpenAI stay in the file, per provider or per model.
 */
export function readCustomProviders(file: string): CustomProvider[] {
  const root = readConfig(file);
  if (root === undefined) return [];
  const declared = root.object("providers");
  root.done();
  return declared.entries().map(([id, provider]) => {
    if (!ID.test(id)) {
      throw declared.problem(
        id,
        "is not a usable provider ID. Use letters, digits, dots, hyphens and underscores, " +
          "starting with a letter or digit",
      );
    }
    return parseProvider(id, provider);
  });
}

function parseProvider(id: string, provider: ConfigObject): CustomProvider {
  const baseUrl = provider.string("baseUrl");
  checkUrl(provider, baseUrl);
  const api = provider.choice("api", CUSTOM_APIS);
  const apiKey = provider.optionalString("apiKey");
  if (apiKey !== undefined) checkKeyAsWritten(provider, "apiKey", apiKey);
  const compat = provider.optionalFreeform("compat");
  const definitions = provider.objects("models");
  provider.done();
  if (definitions.length === 0) throw provider.problem("models", "needs at least one model");

  const models = definitions.map((definition) => parseModel({ provider: id, baseUrl, compat }, definition));
  const seen = new Set<string>();
  for (const { id: modelId } of models) {
    if (seen.has(modelId)) throw provider.problem("models", `lists "${modelId}" more than once`);
    seen.add(modelId);
  }
  return { id, baseUrl, api, apiKey, models };
}

function parseModel(
  inherited: { provider: string; baseUrl: string; compat: Record<string, unknown> | undefined },
  definition: ConfigObject,
): Model<"openai-completions"> {
  const id = definition.string("id");
  const model: Model<"openai-completions"> = {
    id,
    name: definition.optionalString("name") ?? id,
    api: "openai-completions",
    provider: inherited.provider,
    baseUrl: inherited.baseUrl,
    reasoning: definition.optionalBoolean("reasoning") ?? false,
    input: definition.optionalChoices("input", ["text", "image"]) ?? ["text"],
    cost: parseCost(definition.optionalObject("cost")),
    contextWindow: definition.optionalPositiveInteger("contextWindow") ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: definition.optionalPositiveInteger("maxTokens") ?? DEFAULT_MAX_TOKENS,
  };
  const compat = { ...inherited.compat, ...definition.optionalFreeform("compat") };
  definition.done();
  // Without any flags the library detects what it can from the URL.
  return Object.keys(compat).length === 0 ? model : { ...model, compat: compat as OpenAICompletionsCompat };
}

function parseCost(cost: ConfigObject | undefined): Model<"openai-completions">["cost"] {
  if (cost === undefined) return FREE;
  const rates = {
    input: cost.number("input"),
    output: cost.number("output"),
    cacheRead: cost.number("cacheRead"),
    cacheWrite: cost.number("cacheWrite"),
  };
  cost.done();
  return rates;
}

function checkUrl(provider: ConfigObject, baseUrl: string): void {
  const url = URL.canParse(baseUrl) ? new URL(baseUrl) : undefined;
  if (url?.protocol !== "http:" && url?.protocol !== "https:") {
    throw provider.problem(
      "baseUrl",
      `must be an http or https URL, such as http://localhost:11434/v1, not "${baseUrl}"`,
    );
  }
}
