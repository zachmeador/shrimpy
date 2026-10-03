import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import { ModelSetupError } from "./host/index.ts";
import { initHome, parseModelChoice, startHomeAgent } from "./index.ts";
import { attachMain, closeAfter, stubChatCompletions } from "./testing/index.ts";

const timeout = 30_000;

const local = {
  baseUrl: "http://models.invalid/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
  models: [{ id: "qwen", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
};

/** A home that names `local/qwen` and declares that provider. */
function newHome(t: TestContext, providers: object = { local }) {
  useRuntimeDir(t);
  const home = join(tempDir(t, "home-agent"), "scout");
  const { paths } = initHome(home, { name: "scout", model: parseModelChoice("local/qwen") });
  writeFileSync(paths.models, JSON.stringify({ providers }));
  return paths;
}

/** Start the home's agent and attach to it. Both are closed when the test ends. */
async function startAttached(t: TestContext, home: string) {
  const agent = closeAfter(t, await startHomeAgent(home));
  const attached = await attachMain(home);
  t.after(() => attached.connection.close().catch(() => undefined));
  return { agent, ...attached };
}

test("an agent starts from a home alone, and talks to the model the home declares", { timeout }, async (t) => {
  const paths = newHome(t);
  const requests = stubChatCompletions(t, "Hello from qwen");
  const { agent, session } = await startAttached(t, paths.root);

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
});

test("editing the home takes effect at the next start", { timeout }, async (t) => {
  const paths = newHome(t);
  const requests = stubChatCompletions(t, "Ok");

  const first = await startAttached(t, paths.root);
  await first.session.wait((await first.session.steer("one")).submission);
  await first.connection.close();
  await first.agent.close();

  writeFileSync(paths.soul, "Answer in rhyme.\n");
  const second = await startAttached(t, paths.root);
  await second.session.wait((await second.session.steer("two")).submission);

  const systemPrompt = (index: number): string => String(requests[index]?.body.messages[0]?.content);
  assert.match(systemPrompt(0), /You are scout/);
  assert.match(systemPrompt(1), /Answer in rhyme\./);
  assert.doesNotMatch(systemPrompt(1), /You are scout/);
});

test("two homes share no keys, instructions or history", { timeout }, async (t) => {
  const one = newHome(t, { local: { ...local, apiKey: "key-one" } });
  const two = newHome(t, { local: { ...local, apiKey: "key-two" } });
  writeFileSync(two.soul, "You are the second agent.\n");
  const requests = stubChatCompletions(t, "Ok");
  const first = await startAttached(t, one.root);
  const second = await startAttached(t, two.root);

  await first.session.wait((await first.session.steer("hello from one")).submission);
  await second.session.wait((await second.session.steer("hello from two")).submission);

  const [fromOne, fromTwo] = requests;
  assert.equal(fromOne?.headers.authorization, "Bearer key-one");
  assert.equal(fromTwo?.headers.authorization, "Bearer key-two");
  assert.match(String(fromOne.body.messages[0]?.content), /You are scout/);
  assert.match(String(fromTwo.body.messages[0]?.content), /You are the second agent\./);
  assert.doesNotMatch(String(fromTwo.body.messages[0]?.content), /You are scout/);
  assert.deepEqual(
    first.session.view.items.map((item) => item.type === "user" && item.text),
    ["hello from one", false],
  );
  assert.deepEqual(
    second.session.view.items.map((item) => item.type === "user" && item.text),
    ["hello from two", false],
  );
});

test("a model that cannot be used stops the start before the home is claimed", { timeout }, async (t) => {
  const paths = newHome(t, { local: { ...local, apiKey: undefined } });

  await assert.rejects(startHomeAgent(paths.root).then((agent) => closeAfter(t, agent)), ModelSetupError);

  assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
  assert.equal(existsSync(paths.database), false);
});

test("a folder that is not a home is left alone", { timeout }, async (t) => {
  const folder = tempDir(t, "not-a-home");

  await assert.rejects(startHomeAgent(folder).then((agent) => closeAfter(t, agent)), /is not an agent home/);

  assert.deepEqual(readdirSync(folder), []);
  assert.equal(existsSync(homePaths(folder).runtime), false);
});

test("a home with an owner cannot be started again", { timeout }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Ok");
  closeAfter(t, await startHomeAgent(paths.root));

  await assert.rejects(
    startHomeAgent(paths.root).then((agent) => closeAfter(t, agent)),
    /Another process owns the agent home/,
  );
});
