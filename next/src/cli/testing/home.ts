import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Declare the provider `local` in a home's models.json: an OpenAI-compatible
 * server at `url` that serves `model`, with the placeholder key and the flags
 * a Qwen-style server needs.
 */
export function declareLocalModel(home: string, options: { url: string; model: string }): void {
  const provider = {
    baseUrl: options.url,
    api: "openai-completions",
    apiKey: "local",
    compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
    models: [{ id: options.model, reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
  };
  const models = JSON.stringify({ providers: { local: provider } }, null, 2);
  writeFileSync(join(home, "state", "pi", "models.json"), models);
}
