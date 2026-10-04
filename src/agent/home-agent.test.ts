import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { agentMember, type Member } from "../contracts/chat/index.ts";
import { type StandInChat, startStandInChat } from "../contracts/chat/testing/index.ts";
import { attachLocal } from "../contracts/agent/node.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { eventually, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import { ModelSetupError } from "./host/index.ts";
import { initHome, parseModelChoice, previewHomeContext, startHomeAgent } from "./index.ts";
import { attachThread, closeAfter, stubChatCompletions, zach } from "./testing/index.ts";

const timeout = 30_000;

const local = {
  baseUrl: "http://models.invalid/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
  models: [{ id: "qwen", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
};

/** A home that names `local/qwen` and declares that provider. */
function newHome(t: TestContext, providers: object = { local }, name = "scout") {
  useRuntimeDir(t);
  const home = join(tempDir(t, "home-agent"), name);
  const { paths } = initHome(home, { name, model: parseModelChoice("local/qwen") });
  writeFileSync(paths.models, JSON.stringify({ providers }));
  return paths;
}

/** A gateway and a chat server on this machine, the chat server listed with the gateway. */
async function startNetwork(t: TestContext) {
  const gateway = await startStandInGateway(t);
  const chat = await startStandInChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "chat to be listed with the gateway");
  return { gateway, chat };
}

/** Start the home's agent, and wait until it is reading chat's feed. It is stopped when the test ends. */
async function startHeard(t: TestContext, home: string, chat: StandInChat) {
  const reading = chat.chat.calls("feed");
  const agent = closeAfter(t, await startHomeAgent(home));
  await eventually(() => chat.chat.calls("feed"), (calls) => calls > reading, { what: "the agent to read the feed" });
  return agent;
}

/** Zach's DM with the agent called `name`, and the main thread of it. */
function dmWith(chat: StandInChat, name: string) {
  const agent: Member = agentMember(name);
  return chat.chat.dm(zach, agent).thread;
}

test("an agent starts from a home alone, registers with the gateway, finds chat there, and answers in the thread with the model the home declares", { timeout }, async (t) => {
  const paths = newHome(t);
  const requests = stubChatCompletions(t, "Hello from qwen");
  const { gateway, chat } = await startNetwork(t);
  const thread = dmWith(chat, "scout");

  const agent = await startHeard(t, paths.root, chat);
  const asked = chat.chat.say(zach, thread.id, "hi");

  assert.equal(agent.name, "scout");
  assert.equal(agent.home, paths.root);
  assert.deepEqual(
    gateway.registered().filter((program) => program.kind === "agent"),
    [{ kind: "agent", name: "scout", ...agent.endpoint, version: SHRIMPY_VERSION }],
  );
  const receipt = await eventually(
    () => chat.chat.messages().find((message) => message.id === asked.id)?.receipts[0],
    (found) => found !== undefined,
    { what: "a receipt on the message" },
  );
  assert.equal(receipt?.status, "answered");
  assert.deepEqual(
    chat.chat.messages(thread.id).filter((message) => message.author.id === "agent:scout").map((reply) => reply.text),
    ["Hello from qwen"],
  );

  const [sent] = requests;
  assert.equal(sent?.url, "http://models.invalid/v1/chat/completions");
  assert.equal(sent.headers.authorization, "Bearer local");
  assert.equal(sent.body.model, "qwen");
  const [system, user] = sent.body.messages;
  assert.equal(system?.role, "system");
  assert.match(String(system.content), /<soul>/, "the home's SOUL.md is in the instructions");
  assert.match(
    String(user?.content),
    new RegExp(`^Thread ${thread.id} in channel ${thread.channelId}\\.\\n\\nZach wrote at \\d{4}-\\d\\d-\\d\\dT[\\d:]{8}Z:\\nhi$`),
  );
  const { connection, session } = await attachThread(paths.root, thread.id);
  t.after(() => connection.close());
  assert.deepEqual(session.view.status.model, { provider: "local", id: "qwen" });
});

test("the model gets the home's instructions as sections in a fixed order, exactly as the preview shows them", { timeout }, async (t) => {
  const paths = newHome(t);
  writeFileSync(paths.soul, "You are scout, who keeps the build green.\n");
  mkdirSync(join(paths.context, "people"), { recursive: true });
  writeFileSync(join(paths.context, "user.md"), "Zach likes short answers.\n");
  writeFileSync(join(paths.context, "people", "alex.md"), "Alex owns the release.\n");
  mkdirSync(join(paths.skills, "review"), { recursive: true });
  writeFileSync(
    join(paths.skills, "review", "SKILL.md"),
    "---\nname: review\ndescription: Review a diff for bugs.\n---\nSteps.\n",
  );
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  const thread = dmWith(chat, "scout");
  await startHeard(t, paths.root, chat);

  const asked = chat.chat.say(zach, thread.id, "hi");
  await eventually(
    () => chat.chat.messages().find((message) => message.id === asked.id)?.receipts[0],
    (found) => found !== undefined,
    { what: "a receipt on the message" },
  );

  const preview = await previewHomeContext(paths.root);
  assert.deepEqual(preview.sections.map((section) => section.key), ["shrimpy", "soul", "context", "skills"]);
  assert.deepEqual(preview.leftOut, []);
  const [sent] = requests;
  const system = sent?.body.messages[0];
  assert.equal(system?.role, "system");
  assert.equal(system.content, preview.sections.map((section) => section.text).join("\n\n"));
  assert.match(system.content, /<soul>\nYou are scout, who keeps the build green\.\n<\/soul>/);
  assert.match(system.content, /<file path="context\/people\/alex\.md">\nAlex owns the release\.\n<\/file>/);
  assert.match(system.content, new RegExp(`- review: Review a diff for bugs\\.\\n  ${join(paths.skills, "review", "SKILL.md").replaceAll("/", "\\/")}`));
});

test("editing the home takes effect at the next start, in sessions made before it too", { timeout }, async (t) => {
  const paths = newHome(t);
  writeFileSync(paths.soul, "Answer in prose.\n");
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  const thread = dmWith(chat, "scout");

  const first = await startHeard(t, paths.root, chat);
  const one = chat.chat.say(zach, thread.id, "one");
  await eventually(() => chat.chat.messages().find((m) => m.id === one.id)?.receipts[0], (r) => r !== undefined, { what: "the first answer" });
  await first.close();

  writeFileSync(paths.soul, "Answer in rhyme.\n");
  await startHeard(t, paths.root, chat);
  const two = chat.chat.say(zach, thread.id, "two");
  await eventually(() => chat.chat.messages().find((m) => m.id === two.id)?.receipts[0], (r) => r !== undefined, { what: "the second answer" });

  const systemPrompt = (index: number): string => String(requests[index]?.body.messages[0]?.content);
  assert.match(systemPrompt(0), /Answer in prose\./);
  assert.match(systemPrompt(1), /Answer in rhyme\./);
  assert.doesNotMatch(systemPrompt(1), /Answer in prose\./);
});

test("a running agent reads its home again only when asked, and then each session follows with its next request", { timeout }, async (t) => {
  const paths = newHome(t);
  writeFileSync(paths.soul, "Answer in rhyme.\n");
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  const thread = dmWith(chat, "scout");
  await startHeard(t, paths.root, chat);
  const say = async (text: string): Promise<void> => {
    const sent = chat.chat.say(zach, thread.id, text);
    await eventually(
      () => chat.chat.messages().find((message) => message.id === sent.id)?.receipts[0],
      (found) => found !== undefined,
      { what: `an answer to "${text}"` },
    );
  };
  /** Everything the model was told as instructions in a request: the system messages, whichever way they were sent. */
  const told = (index: number): string =>
    (requests[index]?.body.messages ?? [])
      .filter((message) => message.role === "system")
      .map((message) => String(message.content))
      .join("\n");

  await say("one");
  writeFileSync(paths.soul, "Answer in haiku.\n");
  writeFileSync(join(paths.context, "new.md"), "A note written after the start.\n");
  await say("two");
  assert.match(told(1), /Answer in rhyme\./, "editing a file changes nothing for a running agent");
  assert.doesNotMatch(told(1), /A note written after the start\./);

  const connection = await attachLocal(paths.root);
  t.after(() => connection.close());
  const reloaded = await connection.reload();
  assert.equal(reloaded.soul, true);
  assert.equal(reloaded.files, 1);
  assert.deepEqual(reloaded.leftOut, []);
  await say("three");

  assert.match(told(2), /Answer in haiku\./, "a reload reaches the session's next request");
  assert.match(told(2), /A note written after the start\./);
  assert.doesNotMatch(told(2), /Answer in rhyme\./);
  const history = requests[2]?.body.messages.filter((message) => message.role !== "system").map((message) => message.role);
  assert.deepEqual(history, ["user", "assistant", "user", "assistant", "user"], "and what the session held is still there");
});

test("two homes share no keys, instructions or history", { timeout }, async (t) => {
  const one = newHome(t, { local: { ...local, apiKey: "key-one" } }, "scout");
  const two = newHome(t, { local: { ...local, apiKey: "key-two" } }, "other");
  writeFileSync(two.soul, "You are the second agent.\n");
  const requests = stubChatCompletions(t, "Ok");
  const { gateway, chat } = await startNetwork(t);
  const scoutThread = dmWith(chat, "scout");
  const otherThread = dmWith(chat, "other");
  await startHeard(t, one.root, chat);
  await startHeard(t, two.root, chat);
  assert.deepEqual(
    gateway.registered().filter((program) => program.kind === "agent").map((program) => program.name).sort(),
    ["other", "scout"],
  );

  const toOne = chat.chat.say(zach, scoutThread.id, "hello from one");
  const toTwo = chat.chat.say(zach, otherThread.id, "hello from two");
  for (const message of [toOne, toTwo]) {
    await eventually(() => chat.chat.messages().find((m) => m.id === message.id)?.receipts[0], (r) => r !== undefined, { what: "an answer" });
  }

  const fromOne = requests.find((request) => JSON.stringify(request.body.messages).includes("hello from one"));
  const fromTwo = requests.find((request) => JSON.stringify(request.body.messages).includes("hello from two"));
  assert.equal(fromOne?.headers.authorization, "Bearer key-one");
  assert.equal(fromTwo?.headers.authorization, "Bearer key-two");
  assert.match(String(fromOne.body.messages[0]?.content), /You are scout/);
  assert.match(String(fromTwo.body.messages[0]?.content), /You are the second agent\./);
  assert.doesNotMatch(String(fromTwo.body.messages[0]?.content), /You are scout/);
  const texts = async (home: string, thread: string): Promise<string[]> => {
    const { connection, session } = await attachThread(home, thread);
    t.after(() => connection.close());
    return session.view.items.flatMap((item) => (item.type === "user" ? [item.text.split("\n").at(-1) ?? ""] : []));
  };
  assert.deepEqual(await texts(one.root, scoutThread.id), ["hello from one"]);
  assert.deepEqual(await texts(two.root, otherThread.id), ["hello from two"]);
});

test("an agent that starts before the gateway and chat finds them when they come up", { timeout }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Found you.");
  const agent = closeAfter(t, await startHomeAgent(paths.root));
  assert.ok(agent.endpoint.socket, "it started without them");

  const { gateway, chat } = await startNetwork(t);
  const thread = dmWith(chat, "scout");
  await until(() => gateway.registered().some((program) => program.kind === "agent"), "the agent to register");
  await until(() => chat.connections() === 1, "the agent to find chat");
  await eventually(() => chat.chat.calls("feed"), (calls) => calls >= 1, { what: "the agent to read the feed" });
  const asked = chat.chat.say(zach, thread.id, "are you there?");

  const receipt = await eventually(
    () => chat.chat.messages().find((message) => message.id === asked.id)?.receipts[0],
    (found) => found !== undefined,
    { what: "a receipt on the message" },
  );
  assert.equal(receipt?.status, "answered");
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
