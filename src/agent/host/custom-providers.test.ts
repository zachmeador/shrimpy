import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { readCustomProviders } from "./custom-providers.ts";

function modelsFile(t: TestContext, content: unknown): string {
  const file = join(tempDir(t, "models"), "models.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}

const local = {
  baseUrl: "http://messy:8090/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: { supportsDeveloperRole: false, supportsStore: false },
  models: [{ id: "qwen3.8-27b" }],
};

test("a provider is read with its models, and what a model leaves out has defaults", (t) => {
  const [provider] = readCustomProviders(modelsFile(t, { providers: { local } }));

  assert.equal(provider?.id, "local");
  assert.equal(provider.baseUrl, "http://messy:8090/v1");
  assert.equal(provider.apiKey, "local");
  assert.equal(provider.models[0]?.id, "qwen3.8-27b");
  assert.equal(provider.models[0].contextWindow, 128_000);
  assert.equal(provider.models[0].maxTokens, 16_384);
  assert.deepEqual(provider.models[0].compat, local.compat, "and the provider's compat flags reach its models");
});

test("a file that does not fit is refused with the file and the place in it", (t) => {
  const cases: [unknown, string][] = [
    [{ providers: { local: { ...local, headers: { a: "b" } } } }, "providers.local has unsupported keys: headers"],
    [{ providers: { local: { ...local, baseUrl: "localhost:11434" } } }, "providers.local.baseUrl must be an http or https URL"],
    [{ providers: { local: { ...local, models: [] } } }, "providers.local.models needs at least one model"],
  ];
  for (const [content, expected] of cases) {
    const file = modelsFile(t, content);
    assert.throws(
      () => readCustomProviders(file),
      (error: Error) => error.message.startsWith(`${file}: ${expected}`),
      expected,
    );
  }
});
