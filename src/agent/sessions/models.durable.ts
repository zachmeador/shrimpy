import type { Api, Model, Models } from "@earendil-works/pi-ai";
import type { ModelRef } from "@earendil-works/pi-durable";
import type { AgentModels } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";

/** How many a refusal lists before it says how many more there are. */
const LISTED = 12;

/** Plain order of the characters, which does not change with the machine's language. */
const plain = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What went wrong, with the cause under it when there is one. */
function why(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

/**
 * The models the agent can use now: those of a provider that has the keys or
 * the sign-in it needs, or is a server the agent's files declare. Keys are read
 * again at each call, so one that was added since the agent started counts.
 */
async function usable(models: Models): Promise<readonly Model<Api>[]> {
  try {
    return await models.getAvailable();
  } catch (error) {
    refuse(`The agent can't tell which models it can use: ${why(error)}`);
  }
}

/** The IDs, at most `LISTED` of them, and how many more there are. */
function listed(names: readonly string[]): string {
  const more = names.length > LISTED ? ` and ${names.length - LISTED} more` : "";
  return `${names.slice(0, LISTED).join(", ")}${more}`;
}

/** The models the agent can use now, by provider and then ID, and the model its sessions follow by default. */
export async function listModels(models: Models, home: ModelRef): Promise<AgentModels> {
  const found = await usable(models);
  return {
    models: found
      .map(({ provider, id, name }) => ({ provider, id, name }))
      .sort((a, b) => plain(a.provider, b.provider) || plain(a.id, b.id)),
    default: { provider: home.provider, id: home.modelId },
  };
}

/** Refuse `wanted` unless the agent can use it now, saying which models it can. */
export async function requireModel(models: Models, wanted: ModelRef): Promise<void> {
  const found = await usable(models);
  if (found.some(({ provider, id }) => provider === wanted.provider && id === wanted.modelId)) return;
  const ofProvider = found.filter(({ provider }) => provider === wanted.provider).map(({ id }) => id);
  if (ofProvider.length > 0) {
    refuse(
      `The provider "${wanted.provider}" has no model "${wanted.modelId}" that this agent can use. ` +
        `It can use: ${listed(ofProvider.sort(plain))}.`,
    );
  }
  const providers = [...new Set(found.map(({ provider }) => provider))].sort(plain);
  if (providers.length === 0) refuse("This agent can't use any model yet: no provider has a key, a sign-in or a model server.");
  const reason =
    models.getProvider(wanted.provider) === undefined
      ? `it has no provider called "${wanted.provider}"`
      : `it has no key or sign-in for "${wanted.provider}"`;
  refuse(`This agent can't use ${wanted.provider}/${wanted.modelId}: ${reason}. It can use models of: ${listed(providers)}.`);
}
