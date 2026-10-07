import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Models } from "@earendil-works/pi-ai";
import { tempDir } from "../../lib/testing/index.ts";
import { stubChatCompletions } from "../testing/index.ts";
import { buildModels, type ModelRuntimeOptions, ModelSetupError } from "./durable.ts";

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
  configFile: string;
}

function home(t: TestContext, files: { models?: unknown; auth?: unknown } = {}): Home {
  const dir = tempDir(t, "models");
  const modelsFile = join(dir, "models.json");
  const authFile = join(dir, "auth.json");
  writeFileSync(modelsFile, JSON.stringify(files.models ?? { providers: {} }));
  writeFileSync(authFile, JSON.stringify(files.auth ?? {}));
  return { modelsFile, authFile, configFile: join(dir, "agent.json") };
}

/** The `providers/` directory of a folder, with the files it is given. */
function providers(t: TestContext, files: { models?: unknown; auth?: unknown; defaultModel?: unknown } = {}) {
  const dir = tempDir(t, "providers");
  const modelsFile = join(dir, "models.json");
  const authFile = join(dir, "auth.json");
  const defaultModelFile = join(dir, "default-model.json");
  if (files.models !== undefined) writeFileSync(modelsFile, JSON.stringify(files.models));
  if (files.auth !== undefined) writeFileSync(authFile, JSON.stringify(files.auth));
  if (files.defaultModel !== undefined) writeFileSync(defaultModelFile, JSON.stringify(files.defaultModel));
  return { dir, modelsFile, authFile, defaultModelFile };
}

const groq = { provider: "groq", modelId: "llama-3.3-70b-versatile" };

/** The model runtime for a home, which is all most tests want of building one. */
async function modelsOf(options: ModelRuntimeOptions): Promise<Models> {
  return (await buildModels(options)).models;
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
  const models = await modelsOf({ ...files, model: { provider: "local", modelId: "qwen" } });
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
  const models = await modelsOf({ ...files, model: groq });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, groq.provider, groq.modelId);

  assert.equal(requests[0]?.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(requests[0].headers.authorization, "Bearer gsk-from-the-home");
});

test("building the models reaches for no network", async (t) => {
  const reached: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string | URL | Request) => {
    reached.push(input instanceof Request ? input.url : String(input));
    return Promise.reject(new Error("no network in this test"));
  });
  const files = home(t, { auth: { groq: { type: "api_key", key: "gsk-test" } }, models: { providers: { local: qwen } } });

  await buildModels({ ...files, model: groq });
  await buildModels({ ...files, model: { provider: "local", modelId: "qwen" } });

  assert.deepEqual(reached, []);
});

test("keys in the process environment are not used", async (t) => {
  const files = home(t);
  const before = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "gsk-from-the-environment";
  try {
    await assert.rejects(buildModels({ ...files, model: groq }), ModelSetupError);
  } finally {
    if (before === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = before;
  }
});

test("what the home doesn't declare or hold comes from the folder's providers, and what it does is its own", async (t) => {
  const folder = providers(t, {
    models: {
      providers: {
        shared: { ...qwen, baseUrl: "http://shared.invalid/v1" },
        both: { ...qwen, baseUrl: "http://folder.invalid/v1" },
      },
    },
    auth: { groq: { type: "api_key", key: "gsk-from-the-folder" }, both: { type: "api_key", key: "for-the-folder's-server" } },
  });
  const files = home(t, {
    models: { providers: { both: { ...qwen, baseUrl: "http://home.invalid/v1", apiKey: "for-the-home's-server" } } },
  });
  const models = await modelsOf({ ...files, providers: folder.dir, model: { provider: "shared", modelId: "qwen" } });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, "shared", "qwen");
  await ask(models, "both", "qwen");
  await ask(models, groq.provider, groq.modelId);
  const ownKey = home(t, { auth: { groq: { type: "api_key", key: "gsk-from-the-home" } } });
  await ask(await modelsOf({ ...ownKey, providers: folder.dir, model: groq }), groq.provider, groq.modelId);

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "http://shared.invalid/v1/chat/completions",
      "http://home.invalid/v1/chat/completions",
      "https://api.groq.com/openai/v1/chat/completions",
      "https://api.groq.com/openai/v1/chat/completions",
    ],
  );
  // A server the home declares takes the home's key, and never the one the folder holds for a server of that name.
  assert.deepEqual(
    requests.map((request) => request.headers.authorization),
    ["Bearer local", "Bearer for-the-home's-server", "Bearer gsk-from-the-folder", "Bearer gsk-from-the-home"],
  );
});

test("a key added to the folder after the start is used by the next request, with no restart", async (t) => {
  const folder = providers(t, { auth: { groq: { type: "api_key", key: "gsk-first" } } });
  const models = await modelsOf({ ...home(t), providers: folder.dir, model: groq });
  const requests = stubChatCompletions(t, "Hi");

  await ask(models, groq.provider, groq.modelId);
  writeFileSync(folder.authFile, JSON.stringify({ groq: { type: "api_key", key: "gsk-second" } }));
  await ask(models, groq.provider, groq.modelId);

  assert.deepEqual(
    requests.map((request) => request.headers.authorization),
    ["Bearer gsk-first", "Bearer gsk-second"],
  );
});

test("a sign-in makes a provider that signs in with OAuth usable, and with none the start says which files it looks in", async (t) => {
  const files = home(t);
  const model = { provider: "openai-codex", modelId: "gpt-5.3-codex-spark" };
  const folder = providers(t, { auth: {} });
  await assert.rejects(
    buildModels({ ...files, providers: folder.dir, model }),
    (error: Error) =>
      error instanceof ModelSetupError && error.message.includes(files.authFile) && error.message.includes(folder.authFile),
  );

  const signedIn = { "openai-codex": { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 3_600_000 } };
  writeFileSync(folder.authFile, JSON.stringify(signedIn));
  await buildModels({ ...files, providers: folder.dir, model });
});

test("an agent starts with the model its agent.json names, or else the folder's default", async (t) => {
  const two = { ...qwen, models: [...qwen.models, { id: "other", contextWindow: 8_000, maxTokens: 1_000 }] };
  const files = home(t, { models: { providers: { local: two } } });
  const folder = providers(t, { defaultModel: { provider: "local", id: "qwen" } });

  const bare = await buildModels({ ...files, providers: folder.dir });
  const named = await buildModels({ ...files, providers: folder.dir, model: { provider: "local", modelId: "other" } });

  assert.deepEqual(bare.model, { provider: "local", modelId: "qwen" });
  assert.deepEqual(named.model, { provider: "local", modelId: "other" });
});

test("with no model named in agent.json or in the folder, the start says where to name one", async (t) => {
  const files = home(t);
  const folder = providers(t);
  const none = (options: Partial<ModelRuntimeOptions>, mentions: string[]) =>
    assert.rejects(
      buildModels({ ...files, ...options }),
      (error: Error) => error instanceof ModelSetupError && mentions.every((file) => error.message.includes(file)),
    );

  await none({}, [files.configFile]);
  await none({ providers: folder.dir }, [files.configFile, folder.defaultModelFile]);
});

test("a model that cannot be used stops the start, saying which file to change", async (t) => {
  const files = home(t, { models: { providers: { local: qwen, keyless: { ...qwen, apiKey: undefined } } } });
  const unusable = (provider: string, modelId: string, mentions: string[], folderDir?: string) =>
    assert.rejects(
      buildModels({ ...files, ...(folderDir === undefined ? {} : { providers: folderDir }), model: { provider, modelId } }),
      (error: Error) => error instanceof ModelSetupError && mentions.every((file) => error.message.includes(file)),
    );

  await unusable("anthropic", "claude-sonnet-4-5", [files.authFile]);
  await unusable("keyless", "qwen", [files.modelsFile]);
  await unusable("antropic", "x", ["antropic", files.configFile]);
  await unusable("local", "qwen2", ["qwen2", files.configFile]);

  // With a folder's providers, the message names its files too, and the file a provider is declared in when that is the folder's.
  const folder = providers(t, { models: { providers: { shared: { ...qwen, apiKey: undefined } } } });
  await unusable("anthropic", "claude-sonnet-4-5", [files.authFile, folder.authFile], folder.dir);
  await unusable("antropic", "x", [files.modelsFile, folder.modelsFile], folder.dir);
  await unusable("shared", "qwen", [folder.modelsFile], folder.dir);
  await unusable("shared", "qwen2", [folder.modelsFile], folder.dir);
});

test("a model that the folder's default names says so when it cannot be used", async (t) => {
  const files = home(t);
  const folder = providers(t, { defaultModel: { provider: "antropic", id: "claude-sonnet-4-5" } });

  await assert.rejects(
    buildModels({ ...files, providers: folder.dir }),
    (error: Error) => error instanceof ModelSetupError && error.message.includes(folder.defaultModelFile),
  );
});

test("a file that does not fit stops the start, naming the file", async (t) => {
  const files = home(t, { models: { providers: { local: { ...qwen, headers: {} } } } });
  await assert.rejects(
    buildModels({ ...files, model: { provider: "local", modelId: "qwen" } }),
    (error: Error) => error.message.startsWith(files.modelsFile) && error.message.includes("headers"),
  );

  const folder = providers(t, { auth: { groq: { type: "api_key", key: "$GROQ_API_KEY" } } });
  await assert.rejects(
    buildModels({ ...home(t), providers: folder.dir, model: groq }),
    (error: Error) => error.message.startsWith(folder.authFile) && error.message.includes("groq.key"),
  );

  const broken = providers(t, { defaultModel: { provider: "local" } });
  await assert.rejects(
    buildModels({ ...files, providers: broken.dir }),
    (error: Error) => error.message.startsWith(broken.defaultModelFile) && error.message.includes("id"),
  );
});
