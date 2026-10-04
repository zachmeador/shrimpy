import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Models } from "@earendil-works/pi-ai";
import { tempDir } from "../../lib/testing/index.ts";
import { stubChatCompletions } from "../testing/index.ts";
import { buildModels, ModelSetupError } from "./index.ts";

const flags = { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false };

const qwen = {
  baseUrl: "http://models.invalid/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: flags,
  models: [{ id: "qwen", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
};

interface Home {
  modelsFile: string;
  authFile: string;
}

function home(t: TestContext, files: { models?: unknown; auth?: unknown } = {}): Home {
  const dir = tempDir(t, "models");
  const modelsFile = join(dir, "models.json");
  const authFile = join(dir, "auth.json");
  writeFileSync(modelsFile, JSON.stringify(files.models ?? { providers: {} }));
  writeFileSync(authFile, JSON.stringify(files.auth ?? {}));
  return { modelsFile, authFile };
}

/** Ask a model one question and return its reply. */
function ask(models: Models, provider: string, id: string) {
  const model = models.getModel(provider, id);
  assert.ok(model, `${provider}/${id} is known`);
  const context = { systemPrompt: "Be brief.", messages: [{ role: "user" as const, content: "hi", timestamp: 0 }] };
  return models.stream(model, context).result();
}

test("a local server works with a placeholder key, and the flags in models.json shape the request", async (t) => {
  const files = home(t, { models: { providers: { local: qwen, plain: { ...qwen, compat: undefined } } } });
  const models = await buildModels({ ...files, model: { provider: "local", modelId: "qwen" } });
  const requests = stubChatCompletions(t, "Hi there");

  const reply = await ask(models, "local", "qwen");
  assert.equal(reply.stopReason, "stop");
  assert.deepEqual(reply.content, [{ type: "text", text: "Hi there" }]);

  const [sent] = requests;
  assert.equal(sent?.url, "http://models.invalid/v1/chat/completions");
  assert.equal(sent.headers.authorization, "Bearer local");
  assert.deepEqual(sent.body.messages[0], { role: "system", content: "Be brief." });
  assert.equal("store" in sent.body, false);

  // The same server without the flags would be sent what OpenAI itself accepts.
  await ask(models, "plain", "qwen");
  assert.deepEqual(requests[1]?.body.messages[0], { role: "developer", content: "Be brief." });
  assert.equal(requests[1].body.store, false);
});

test("a hosted provider uses the key in auth.json", async (t) => {
  const files = home(t, { auth: { groq: { type: "api_key", key: "gsk-from-the-home" } } });
  const models = await buildModels({ ...files, model: { provider: "groq", modelId: "llama-3.3-70b-versatile" } });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, "groq", "llama-3.3-70b-versatile");

  assert.equal(requests[0]?.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(requests[0].headers.authorization, "Bearer gsk-from-the-home");
});

test("a key stored for a custom provider wins over the one in models.json", async (t) => {
  const files = home(t, {
    models: { providers: { local: qwen } },
    auth: { local: { type: "api_key", key: "real-key" } },
  });
  const models = await buildModels({ ...files, model: { provider: "local", modelId: "qwen" } });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, "local", "qwen");

  assert.equal(requests[0]?.headers.authorization, "Bearer real-key");
});

test("building the models reaches for no network", async (t) => {
  const reached: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    reached.push(input instanceof Request ? input.url : String(input));
    return Promise.reject(new Error("no network in this test"));
  });
  const files = home(t, { auth: { groq: { type: "api_key", key: "gsk-test" } }, models: { providers: { local: qwen } } });

  await buildModels({ ...files, model: { provider: "groq", modelId: "llama-3.3-70b-versatile" } });
  await buildModels({ ...files, model: { provider: "local", modelId: "qwen" } });

  assert.deepEqual(reached, []);
});

test("keys in the process environment are not used", async (t) => {
  const files = home(t);
  const before = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk-from-the-environment";
  try {
    await assert.rejects(
      buildModels({ ...files, model: { provider: "groq", modelId: "llama-3.3-70b-versatile" } }),
      ModelSetupError,
    );
  } finally {
    if (before === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = before;
  }
});

test("a provider with no key says where to put one", async (t) => {
  const files = home(t);
  await assert.rejects(
    buildModels({ ...files, model: { provider: "anthropic", modelId: "claude-sonnet-4-5" } }),
    new ModelSetupError(
      `The provider "anthropic" has no API key. Add one to ${files.authFile}, ` +
        'for example {"anthropic":{"type":"api_key","key":"<your key>"}}',
    ),
  );

  const keyless = home(t, { models: { providers: { local: { ...qwen, apiKey: undefined } } } });
  await assert.rejects(
    buildModels({ ...keyless, model: { provider: "local", modelId: "qwen" } }),
    new ModelSetupError(
      'The provider "local" has no API key. A server that needs none still takes a placeholder: ' +
        `set "apiKey": "local" under providers.local in ${keyless.modelsFile}.`,
    ),
  );

  await assert.rejects(
    buildModels({ ...files, model: { provider: "openai-codex", modelId: "gpt-5.3-codex-spark" } }),
    new ModelSetupError('The provider "openai-codex" signs in with OAuth, which this build cannot do yet.'),
  );
});

test("an unknown provider or model says what is available", async (t) => {
  const files = home(t, { models: { providers: { local: qwen } } });

  await assert.rejects(
    buildModels({ ...files, model: { provider: "antropic", modelId: "x" } }),
    (error: Error) =>
      error instanceof ModelSetupError &&
      error.message.startsWith(`The model antropic/x names the provider "antropic", which is not declared in ${files.modelsFile} (declared there: local)`) &&
      error.message.includes("built in: ") &&
      error.message.includes("anthropic, "),
  );

  await assert.rejects(
    buildModels({ ...files, model: { provider: "local", modelId: "qwen2" } }),
    new ModelSetupError(
      `The provider "local" has no model "qwen2". It has: qwen. Add it under providers.local.models in ${files.modelsFile}.`,
    ),
  );

  await assert.rejects(
    buildModels({ ...files, model: { provider: "openrouter", modelId: "nope" } }),
    (error: Error) => /^The provider "openrouter" has no model "nope"\. It has: .+ and \d+ more\.$/.test(error.message),
  );
});

test("a provider in models.json replaces a built-in one with the same ID", async (t) => {
  const files = home(t, { models: { providers: { groq: qwen } } });
  const models = await buildModels({ ...files, model: { provider: "groq", modelId: "qwen" } });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, "groq", "qwen");

  assert.equal(requests[0]?.url, "http://models.invalid/v1/chat/completions");
  assert.equal(models.getModel("groq", "llama-3.3-70b-versatile"), undefined);
});

test("a file that does not fit stops the start, naming the file", async (t) => {
  const files = home(t, { models: { providers: { local: { ...qwen, headers: {} } } } });
  await assert.rejects(
    buildModels({ ...files, model: { provider: "local", modelId: "qwen" } }),
    new RegExp(`${files.modelsFile.replaceAll(".", "\\.")}: providers\\.local has unsupported keys: headers`),
  );
});
