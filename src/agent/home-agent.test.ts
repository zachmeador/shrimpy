import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { Message, Receipt } from "../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import type { TestGateway } from "../contracts/gateway/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { eventually, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import { ModelSetupError } from "./host/index.ts";
import { initHome, parseModelChoice, previewHomeContext, startHomeAgent } from "./index.ts";
import { attachThread, type ChatServer, closeAfter, startChatServer, stubChatCompletions, talkTo } from "./testing/index.ts";

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

/** A gateway and the chat server on this machine. The chat server lists itself with the gateway. */
async function startNetwork(t: TestContext) {
  const chat = await startChatServer(t);
  // An agent that was started first may be listed already, so chat is looked for by its kind.
  await eventually(() => registered(chat.gateway), (programs) => programs.some((program) => program.kind === "chat"), {
    what: "chat to be listed with the gateway",
  });
  return { gateway: chat.gateway, chat };
}

/** The programs the gateway lists, asked over a connection of its own. */
async function registered(gateway: TestGateway): Promise<Registration[]> {
  const observer = await gateway.connect();
  try {
    return await observer.list();
  } finally {
    await observer.close();
  }
}

/** The agents among them. */
const agentsOf = async (gateway: TestGateway): Promise<Registration[]> =>
  (await registered(gateway)).filter((program) => program.kind === "agent");

/** The roster, asked over a connection of its own. */
async function rosterOf(gateway: TestGateway): Promise<RosterEntry[]> {
  const observer = await gateway.connect();
  try {
    return await observer.members();
  } finally {
    await observer.close();
  }
}

/** The names of the agents on the roster, in order. */
const agentNames = async (gateway: TestGateway): Promise<string[]> =>
  (await rosterOf(gateway)).filter((member) => member.kind === "agent").map((member) => member.name).sort();

/** Change the name a home's `agent.json` gives its agent, as a person does with an editor. */
function renameHome(paths: ReturnType<typeof newHome>, name: string): void {
  const config = JSON.parse(readFileSync(paths.config, "utf8")) as object;
  writeFileSync(paths.config, JSON.stringify({ ...config, name }));
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Start the home's agent. It is stopped when the test ends. */
async function startAt(t: TestContext, home: string) {
  return closeAfter(t, await startHomeAgent(home));
}

/** Zach, in his DM with the agent called `name`, who says something and waits until the agent has left its receipt. */
async function talkToAgent(chat: ChatServer, name: string) {
  const talk = await talkTo(chat, name);
  return {
    me: talk.me,
    partner: talk.partner,
    thread: talk.thread,
    replies: () => talk.replies(),
    async ask(text: string, timeoutMs?: number): Promise<{ asked: Message; receipt: Receipt }> {
      const asked = await talk.say(text);
      return { asked, receipt: await talk.receiptOn(asked, timeoutMs) };
    },
  };
}

test("an agent starts from a home alone, registers with the gateway, finds chat there, and answers in the thread with the model the home declares", { timeout }, async (t) => {
  const paths = newHome(t);
  const requests = stubChatCompletions(t, "Hello from qwen");
  const { gateway, chat } = await startNetwork(t);

  const agent = await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const { receipt } = await person.ask("hi");

  assert.equal(agent.name, "scout");
  assert.equal(agent.home, paths.root);
  assert.deepEqual(await agentsOf(gateway), [
    { kind: "agent", name: "scout", memberId: person.partner.id, ...agent.endpoint, version: SHRIMPY_VERSION },
  ]);
  assert.equal(receipt.status, "answered");
  assert.deepEqual((await person.replies()).map((reply) => reply.text), ["Hello from qwen"]);

  const [sent] = requests;
  assert.equal(sent?.url, "http://models.invalid/v1/chat/completions");
  assert.equal(sent.headers.authorization, "Bearer local");
  assert.equal(sent.body.model, "qwen");
  const [system, user] = sent.body.messages;
  assert.equal(system?.role, "system");
  assert.match(
    String(user?.content),
    new RegExp(`^Thread th_\\w+ in channel ch_\\w+\\.\\n\\n${escaped(person.me.name)} wrote at \\S+:\\nhi$`),
    "the facts about a message travel with it",
  );
  const { connection, session } = await attachThread(paths.root, person.thread.id);
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
  await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");

  await person.ask("hi");

  const preview = await previewHomeContext(paths.root);
  assert.deepEqual(preview.sections.map((section) => section.key), ["shrimpy", "soul", "context", "skills"]);
  assert.deepEqual(preview.leftOut, []);
  const system = requests[0]?.body.messages[0];
  assert.equal(system?.role, "system");
  assert.equal(system.content, preview.sections.map((section) => section.text).join("\n\n"));
});

test("editing the home takes effect at the next start, in sessions made before it too", { timeout }, async (t) => {
  const paths = newHome(t);
  writeFileSync(paths.soul, "Answer in prose.\n");
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);

  const first = await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  await person.ask("one");
  await first.close();

  writeFileSync(paths.soul, "Answer in rhyme.\n");
  await startAt(t, paths.root);
  await person.ask("two");

  const systemPrompt = (index: number): string => String(requests[index]?.body.messages[0]?.content);
  assert.match(systemPrompt(0), /Answer in prose\./);
  assert.match(systemPrompt(1), /Answer in rhyme\./);
  assert.doesNotMatch(systemPrompt(1), /Answer in prose\./);
});

test("two homes share no keys, instructions or history", { timeout }, async (t) => {
  const one = newHome(t, { local: { ...local, apiKey: "key-one" } }, "scout");
  const two = newHome(t, { local: { ...local, apiKey: "key-two" } }, "other");
  writeFileSync(two.soul, "You are the second agent.\n");
  const requests = stubChatCompletions(t, "Ok");
  const { gateway, chat } = await startNetwork(t);
  await startAt(t, one.root);
  await startAt(t, two.root);
  const toOne = await talkToAgent(chat, "scout");
  const toTwo = await talkToAgent(chat, "other");
  await eventually(() => agentsOf(gateway), (agents) => agents.length === 2, { what: "both agents to register" });
  assert.deepEqual((await agentsOf(gateway)).map((program) => program.name).sort(), ["other", "scout"]);

  await toOne.ask("hello from one");
  await toTwo.ask("hello from two");

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
  assert.deepEqual(await texts(one.root, toOne.thread.id), ["hello from one"]);
  assert.deepEqual(await texts(two.root, toTwo.thread.id), ["hello from two"]);
});

test("an agent that starts before the gateway and chat finds them when they come up", { timeout: 60_000 }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Found you.");
  const agent = await startAt(t, paths.root);
  assert.ok(agent.endpoint.socket, "it started without them");

  const { gateway, chat } = await startNetwork(t);
  // The agent looks again after growing pauses, so a slow machine can make it a while.
  await eventually(() => agentsOf(gateway), (agents) => agents.length === 1, { what: "the agent to register", timeoutMs: 30_000 });
  const person = await talkToAgent(chat, "scout");

  const { receipt } = await person.ask("are you there?", 30_000);

  assert.equal(receipt.status, "answered");
});

test("an agent and the gateway that both start again are the same member as before, in the same DM with what was said in it", { timeout }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Hello");
  const { gateway, chat } = await startNetwork(t);
  const first = await startAt(t, paths.root);
  const before = await talkToAgent(chat, "scout");
  await before.ask("first hello");
  await first.close();
  await gateway.outage();
  await gateway.recover();

  await startAt(t, paths.root);
  const after = await talkToAgent(chat, "scout");
  const { receipt } = await after.ask("second hello");

  assert.deepEqual([after.partner.id, after.thread.id], [before.partner.id, before.thread.id]);
  assert.equal(receipt.status, "answered");
  assert.deepEqual((await after.replies()).map((reply) => reply.text), ["Hello", "Hello"], "the first exchange is still there");
  assert.deepEqual(await agentNames(gateway), ["scout"]);
});

test("a home whose name another member has is refused and told which file to change, and joins once the name is changed", { timeout }, async (t) => {
  const one = newHome(t);
  const two = newHome(t);
  stubChatCompletions(t, "Hello");
  const reported: string[] = [];
  t.mock.method(console, "error", (...lines: unknown[]) => void reported.push(lines.join(" ")));
  const { gateway } = await startNetwork(t);
  await startAt(t, one.root);
  const refused = await startAt(t, two.root);

  await eventually(async () => reported.find((report) => report.includes(two.config)), (found) => found !== undefined, {
    what: "the second agent to say which file to change",
  });
  assert.deepEqual(await agentNames(gateway), ["scout"], "the first keeps the name");
  assert.equal(readMembership(two.root)?.memberId, undefined, "and the second has no place on the roster");

  await refused.close();
  renameHome(two, "scout-two");
  await startAt(t, two.root);
  await eventually(() => agentNames(gateway), (names) => names.length === 2, { what: "the second agent to join" });
  assert.deepEqual(await agentNames(gateway), ["scout", "scout-two"]);
});

test("a home that kept its token but never heard it had joined joins again as the same member", { timeout }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Hello");
  const { gateway, chat } = await startNetwork(t);
  // A first start that made and kept its token, joined, and ended before it wrote down the gateway's answer.
  const token = newToken();
  saveMembership(paths.root, { token });
  const observer = await gateway.connect();
  const joined = await observer.join("scout", token);

  await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const { receipt } = await person.ask("hello");

  assert.equal(person.partner.id, joined.id);
  assert.equal(receipt.status, "answered");
  assert.deepEqual(await agentNames(gateway), ["scout"], "and the name is not taken by a second member");
  assert.deepEqual(readMembership(paths.root), { memberId: joined.id, token });
});

test("a home whose name was changed is the same member under the new name, in the same DM with what was said in it", { timeout }, async (t) => {
  const paths = newHome(t);
  stubChatCompletions(t, "Hello");
  const { gateway, chat } = await startNetwork(t);
  const first = await startAt(t, paths.root);
  const before = await talkToAgent(chat, "scout");
  await before.ask("first hello");
  await first.close();

  renameHome(paths, "skipper");
  await startAt(t, paths.root);
  const after = await talkToAgent(chat, "skipper");
  const { receipt } = await after.ask("second hello");

  assert.deepEqual([after.partner.id, after.thread.id], [before.partner.id, before.thread.id]);
  assert.equal(receipt.status, "answered");
  assert.deepEqual((await after.replies()).map((reply) => [reply.text, reply.author.name]), [
    ["Hello", "skipper"],
    ["Hello", "skipper"],
  ]);
  assert.deepEqual(await agentNames(gateway), ["skipper"]);
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
