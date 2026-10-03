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
  writeFileSync(join(home, "state", "pi", "models.json"), JSON.stringify({ providers: { local: provider } }, null, 2));
}

/** Resolve once `done` is true, checking every 20 ms. */
export async function eventually(done: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
