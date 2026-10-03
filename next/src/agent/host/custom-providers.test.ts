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
  assert.deepEqual(provider.models, [
    {
      id: "qwen3.8-27b",
      name: "qwen3.8-27b",
      api: "openai-completions",
      provider: "local",
      baseUrl: "http://messy:8090/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
      compat: { supportsDeveloperRole: false, supportsStore: false },
    },
  ]);
});

test("a model can set everything, and its compat flags add to the provider's", (t) => {
  const [provider] = readCustomProviders(
    modelsFile(t, {
      providers: {
        local: {
          ...local,
          models: [
            {
              id: "vision",
              name: "Vision",
              reasoning: true,
              input: ["text", "image"],
              cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 },
              contextWindow: 262_144,
              maxTokens: 65_536,
              compat: { supportsStore: true, thinkingFormat: "qwen" },
            },
          ],
        },
      },
    }),
  );

  assert.deepEqual(provider?.models[0], {
    id: "vision",
    name: "Vision",
    api: "openai-completions",
    provider: "local",
    baseUrl: "http://messy:8090/v1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 },
    contextWindow: 262_144,
    maxTokens: 65_536,
    compat: { supportsDeveloperRole: false, supportsStore: true, thinkingFormat: "qwen" },
  });
});

test("without flags a model carries no compat, so the library detects what it can", (t) => {
  const { compat: _flags, ...bare } = local;
  const [provider] = readCustomProviders(modelsFile(t, { providers: { local: bare } }));
  assert.equal(provider?.models[0]?.compat, undefined);
  assert.equal(provider?.models[0] && "compat" in provider.models[0], false);
});

test("a models.json that today's Shrimpy wrote for a local server loads as it is", (t) => {
  const written = {
    providers: {
      local: {
        baseUrl: "http://localhost:11434/v1",
        apiKey: "local",
        api: "openai-completions",
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, thinkingFormat: "qwen" },
        models: [
          {
            id: "qwen3:8b",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          },
        ],
      },
    },
  };
  const [provider] = readCustomProviders(modelsFile(t, written));

  assert.equal(provider?.apiKey, "local");
  assert.equal(provider.models[0]?.id, "qwen3:8b");
  assert.equal(provider.models[0].maxTokens, 8192);
  assert.deepEqual(provider.models[0].compat, written.providers.local.compat);
});

test("no file, or no providers, declares none", (t) => {
  assert.deepEqual(readCustomProviders(join(tempDir(t, "models"), "no-such-models.json")), []);
  assert.deepEqual(readCustomProviders(modelsFile(t, { providers: {} })), []);
});

test("a file that does not fit is reported with the file and the place in it", (t) => {
  const cases: [unknown, string][] = [
    [{}, "providers is required"],
    [{ providers: {}, extra: 1 }, "the file has unsupported keys: extra. Supported keys: providers"],
    [{ providers: { "a/b": local } }, "providers.a/b is not a usable provider ID"],
    [{ providers: { local: { ...local, headers: { a: "b" } } } }, "providers.local has unsupported keys: headers. Supported keys: baseUrl, api, apiKey, compat, models"],
    [{ providers: { local: { ...local, baseUrl: "localhost:11434" } } }, 'providers.local.baseUrl must be an http or https URL, such as http://localhost:11434/v1, not "localhost:11434"'],
    [{ providers: { local: { ...local, api: "anthropic-messages" } } }, 'providers.local.api must be "openai-completions", not "anthropic-messages"'],
    [{ providers: { local: { ...local, models: [] } } }, "providers.local.models needs at least one model"],
    [{ providers: { local: { ...local, models: [{ id: "a" }, { id: "a" }] } } }, 'providers.local.models lists "a" more than once'],
    [{ providers: { local: { ...local, models: [{ name: "x" }] } } }, "providers.local.models[0].id is required"],
    [{ providers: { local: { ...local, models: [{ id: "a", contextWindow: 0 }] } } }, "providers.local.models[0].contextWindow must be a whole number above zero"],
    [{ providers: { local: { ...local, models: [{ id: "a", input: ["audio"] }] } } }, 'providers.local.models[0].input[0] must be "text" or "image"'],
    [{ providers: { local: { ...local, models: [{ id: "a", cost: { input: 1 } }] } } }, "providers.local.models[0].cost.output is required"],
    [{ providers: { local: { ...local, models: [{ id: "a", thinkingLevelMap: {} }] } } }, "providers.local.models[0] has unsupported keys: thinkingLevelMap"],
    [{ providers: { local: { ...local, compat: "fast" } } }, "providers.local.compat must be a JSON object"],
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

test("a key is used as written, so a variable or command is refused", (t) => {
  for (const apiKey of ["$OPENAI_API_KEY", "!pass show key"]) {
    const file = modelsFile(t, { providers: { local: { ...local, apiKey } } });
    assert.throws(() => readCustomProviders(file), /providers\.local\.apiKey is used exactly as written/, apiKey);
  }
});
