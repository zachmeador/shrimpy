import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import type { ModelServer } from "./model-server.ts";
import { shrimpy } from "./process.ts";

/**
 * The provider `local` as a models.json declares it: an OpenAI-compatible
 * server at `url` that serves `models`, with the flags a Qwen-style server
 * needs, and the placeholder key it is given as `apiKey`, if any.
 */
export function localProvider(options: { url: string; models: string[]; apiKey?: string }): object {
  return {
    baseUrl: options.url,
    api: "openai-completions",
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
    models: options.models.map((id) => ({ id, reasoning: true, contextWindow: 262_144, maxTokens: 65_536 })),
  };
}

/**
 * Declare the provider `local` in a home's models.json: an OpenAI-compatible
 * server at `url` that serves `model`, with the placeholder key and the flags
 * a Qwen-style server needs.
 */
export function declareLocalModel(home: string, options: { url: string; model: string }): void {
  const provider = localProvider({ url: options.url, models: [options.model], apiKey: "local" });
  const models = JSON.stringify({ providers: { local: provider } }, null, 2);
  writeFileSync(join(home, "state", "pi", "models.json"), models);
}

/**
 * A home for the agent called `name`, scout unless the test says otherwise, made
 * with `shrimpy agent init` in a directory of its own and set up to use the test
 * model. It is removed when the test ends.
 */
export async function agentHome(t: TestContext, model: ModelServer, name = "scout"): Promise<string> {
  const home = join(tempDir(t, `${name}-home`), name);
  const init = await shrimpy(["agent", "init", home, "--name", name, "--model", "local/test-model"]);
  if (init.code !== 0) throw new Error(`shrimpy agent init ended with ${String(init.code)}:\n${init.stderr}`);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}
