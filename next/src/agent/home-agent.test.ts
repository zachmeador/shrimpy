import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { homePaths } from "./home/index.ts";
import { ModelSetupError } from "./host/index.ts";
import { initHome, parseModelChoice, startHomeAgent } from "./index.ts";
import { attachMain, stubChatCompletions } from "./testing/index.ts";

const timeout = 30_000;

const local = {
  baseUrl: "http://models.invalid/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
  models: [{ id: "qwen", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
};

/** A home that names `local/qwen` and declares that provider. */
function newHome(providers: object = { local }) {
  const home = join(mkdtempSync(join(tmpdir(), "shrimpy-home-agent-")), "scout");
  const { paths } = initHome(home, { name: "scout", model: parseModelChoice("local/qwen") });
  writeFileSync(paths.models, JSON.stringify({ providers }));
  return paths;
}

test("an agent starts from a home alone, and talks to the model the home declares", { timeout }, async (t) => {
  const paths = newHome();
  const requests = stubChatCompletions(t, "Hello from qwen");
  const agent = await startHomeAgent(paths.root);
  const { connection, session } = await attachMain(paths.root);
  try {
    assert.equal(agent.name, "scout");
    assert.equal(agent.home, paths.root);

    const { submission } = await session.steer("hi");
    assert.deepEqual(await session.wait(submission), { status: "answered", text: "Hello from qwen" });
    assert.deepEqual(session.view.status.model, { provider: "local", id: "qwen" });

    const [sent] = requests;
    assert.equal(sent?.url, "http://models.invalid/v1/chat/completions");
    assert.equal(sent.headers.authorization, "Bearer local");
    assert.equal(sent.body.model, "qwen");
    const [system] = sent.body.messages;
    assert.equal(system?.role, "system");
    assert.match(String(system.content), /You are scout, a Shrimpy agent built on Pi\./);
  } finally {
    await connection.close();
    await agent.close();
  }
});

test("editing the home takes effect at the next start", { timeout }, async (t) => {
  const paths = newHome();
  const requests = stubChatCompletions(t, "Ok");

  const first = await startHomeAgent(paths.root);
  const before = await attachMain(paths.root);
  await before.session.wait((await before.session.steer("one")).submission);
  await before.connection.close();
  await first.close();

  writeFileSync(paths.soul, "Answer in rhyme.\n");
  const second = await startHomeAgent(paths.root);
  const after = await attachMain(paths.root);
  try {
    await after.session.wait((await after.session.steer("two")).submission);
    const systemPrompt = (index: number): string => String(requests[index]?.body.messages[0]?.content);
    assert.match(systemPrompt(0), /You are scout/);
    assert.match(systemPrompt(1), /Answer in rhyme\./);
    assert.doesNotMatch(systemPrompt(1), /You are scout/);
  } finally {
    await after.connection.close();
    await second.close();
  }
});

test("a model that cannot be used stops the start before the home is claimed", { timeout }, async () => {
  const paths = newHome({ local: { ...local, apiKey: undefined } });

  await assert.rejects(startHomeAgent(paths.root), ModelSetupError);

  assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
  assert.equal(existsSync(paths.database), false);
});

test("a folder that is not a home is left alone", { timeout }, async () => {
  const folder = mkdtempSync(join(tmpdir(), "shrimpy-not-a-home-"));

  await assert.rejects(startHomeAgent(folder), /is not an agent home/);

  assert.deepEqual(readdirSync(folder), []);
  assert.equal(existsSync(homePaths(folder).runtime), false);
});

test("a home with an owner cannot be started again", { timeout }, async (t) => {
  const paths = newHome();
  stubChatCompletions(t, "Ok");
  const agent = await startHomeAgent(paths.root);
  try {
    await assert.rejects(startHomeAgent(paths.root), /Another process owns the agent home/);
  } finally {
    await agent.close();
  }
});
