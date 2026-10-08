import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { AgentModels } from "../contracts/agent/index.ts";
import { attachLocal, readMembership, saveMembership } from "../contracts/agent/node.ts";
import type { Message, Receipt } from "../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import type { TestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { homePaths } from "./home/index.ts";
import { ModelSetupError } from "./host/durable.ts";
import { initHome, parseModelChoice, previewHomeContext, startHomeAgent } from "./index.ts";
import { attachThread, type ChatServer, closeAfter, roomWith, startChatServer, stubChatCompletions, talkTo } from "./testing/index.ts";

const timeout = 30_000;

const local = {
  baseUrl: "http://models.invalid/v1",
  api: "openai-completions",
  apiKey: "local",
  compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false },
  models: [{ id: "qwen", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 }],
};

/** `local`, serving three models. */
const several = {
  ...local,
  models: [
    ...local.models,
    { id: "llama", contextWindow: 131_072, maxTokens: 8_192 },
    { id: "mistral", name: "Mistral Small", contextWindow: 32_768, maxTokens: 4_096 },
  ],
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

/** Change the model a home's `agent.json` names, as a person does with an editor. */
function nameModel(paths: ReturnType<typeof newHome>, provider: string, id: string): void {
  const config = JSON.parse(readFileSync(paths.config, "utf8")) as object;
  writeFileSync(paths.config, JSON.stringify({ ...config, model: { provider, id } }));
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
    replies: (threadId?: string) => talk.replies(threadId),
    said: (threadId?: string) => talk.said(threadId),
    newThread: () => talk.newThread(),
    async ask(text: string, timeoutMs?: number): Promise<{ asked: Message; receipt: Receipt }> {
      const asked = await talk.say(text);
      return { asked, receipt: await talk.receiptOn(asked, timeoutMs) };
    },
    /** The same in a side thread, which has a session of its own. */
    async askIn(threadId: string, text: string): Promise<{ asked: Message; receipt: Receipt }> {
      const asked = await talk.say(text, threadId);
      return { asked, receipt: await talk.receiptOn(asked) };
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
    { kind: "agent", name: "scout", memberId: person.partner.id, version: SHRIMPY_VERSION },
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
    new RegExp(`^[^\\n]*Thread th_\\w+ in channel ch_\\w+\\.\\n\\n${escaped(person.me.name)} wrote at \\S+:\\nhi$`),
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

test("a reload makes a session that already exists use the model agent.json names now, with nothing started again, and names a model it can't use", { timeout }, async (t) => {
  const paths = newHome(t, { local: several });
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const connection = await attachLocal(paths.root);
  t.after(() => connection.close());

  await person.ask("one");
  nameModel(paths, "local", "llama");
  const changed = await connection.reload();
  await person.ask("two");
  assert.deepEqual(
    [changed.model, changed.changedFrom, changed.leftOut],
    [{ provider: "local", id: "llama" }, { provider: "local", id: "qwen" }, []],
  );

  // A model the agent can't use is named, and the next request names the model it had.
  nameModel(paths, "local", "llam");
  const refused = await connection.reload();
  await person.ask("three");
  assert.deepEqual([refused.model, refused.changedFrom], [{ provider: "local", id: "llama" }, null]);
  assert.equal(refused.leftOut.length, 1);
  assert.equal(refused.leftOut[0]?.file, "agent.json");
  assert.match(refused.leftOut[0].reason, /llam\b/);

  // A server declared since the start can be named.
  const fresh = { ...local, baseUrl: "http://fresh.invalid/v1", models: [{ id: "newest", contextWindow: 8_000, maxTokens: 1_000 }] };
  writeFileSync(paths.models, JSON.stringify({ providers: { local: several, fresh } }));
  nameModel(paths, "fresh", "newest");
  await connection.reload();
  await person.ask("four");

  assert.deepEqual(requests.map((request) => request.body.model), ["qwen", "llama", "llama", "newest"]);
  assert.equal(requests[3]?.url, "http://fresh.invalid/v1/chat/completions");

  // The model is told when the model that wrote its last answer is not the one it runs on, whatever changed it, and once.
  const shown = (index: number): string => String(requests[index]?.body.messages.findLast((message) => message.role === "user")?.content);
  assert.ok(shown(1).includes("local/qwen") && shown(1).includes("local/llama"));
  assert.doesNotMatch(shown(2), /local\/qwen/);
  assert.ok(shown(3).includes("local/llama") && shown(3).includes("fresh/newest"));
});

test("a thread given a model of its own by /model keeps it through a reload that finds the home naming the same model, and follows the home again after one that finds another, or after the agent is started again", { timeout }, async (t) => {
  const paths = newHome(t, { local: several });
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  const first = await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const side = await person.newThread();
  const connection = await attachLocal(paths.root);
  t.after(() => connection.close());

  await person.ask("/model local/llama");
  await person.askIn(side.id, "/model local/mistral");
  assert.equal((await connection.reload()).changedFrom, null);
  await person.ask("main");
  await person.askIn(side.id, "side");

  // The home names mistral now, which one thread was given already, and the other follows it.
  nameModel(paths, "local", "mistral");
  assert.deepEqual((await connection.reload()).changedFrom, { provider: "local", id: "qwen" });
  await person.ask("main");
  await person.askIn(side.id, "side");

  await person.ask("/model local/llama");
  await first.close();
  await startAt(t, paths.root);
  await person.ask("after the start");

  assert.deepEqual(requests.map((request) => request.body.model), [
    // The reload that changed nothing left what the threads were given.
    "llama", "mistral",
    // The home names mistral.
    "mistral", "mistral",
    // And a start follows the home, whatever a thread was given.
    "mistral",
  ]);
});

test("an agent says which models it can use now and which one its sessions follow", { timeout }, async (t) => {
  const paths = newHome(t, { local: several });
  writeFileSync(paths.auth, JSON.stringify({ groq: { type: "api_key", key: "gsk-test" } }));
  await startNetwork(t);
  await startAt(t, paths.root);
  const connection = await attachLocal(paths.root);
  t.after(() => connection.close());
  const providers = ({ models }: AgentModels): string[] => [...new Set(models.map((model) => model.provider))];

  const listed = await connection.models();
  assert.deepEqual(
    listed.models.filter((model) => model.provider === "local").map(({ id, name }) => [id, name]),
    [["llama", "llama"], ["mistral", "Mistral Small"], ["qwen", "qwen"]],
  );
  assert.deepEqual(providers(listed), ["groq", "local"], "a key makes its provider's models usable, and no other provider's");
  assert.deepEqual(listed.default, { provider: "local", id: "qwen" });

  // A key added since the agent started counts at once.
  writeFileSync(paths.auth, JSON.stringify({ groq: { type: "api_key", key: "gsk-test" }, anthropic: { type: "api_key", key: "sk-test" } }));
  assert.deepEqual(providers(await connection.models()), ["anthropic", "groq", "local"]);
});

test("/model as the first message of a new thread starts the thread on that model, which the agent says in the thread, and /model default has the thread follow the agent's model again, which the model is told once", { timeout }, async (t) => {
  const paths = newHome(t, { local: several });
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const side = await person.newThread();
  /** The model each request named, in order. */
  const named = (): string[] => requests.map((request) => request.body.model);
  /** What the model was shown with the newest message of a request. */
  const shown = (index: number): string => String(requests[index]?.body.messages.findLast((message) => message.role === "user")?.content);

  const command = await person.askIn(side.id, "/model local/llama");
  const [line] = await person.replies(side.id);
  assert.equal(command.receipt.status, "answered");
  assert.equal(command.receipt.reply, line?.id, "the receipt names the agent's line");
  assert.ok(line?.text.includes("local/llama") && line.text.includes("local/qwen"), "which says the model it runs on now and the one it ran on");
  assert.deepEqual(named(), [], "and no request was made for the command");
  assert.deepEqual((await person.said(side.id)).map((message) => message.author.id), [person.me.id, person.partner.id]);
  const alone = await person.askIn(side.id, "/model");
  const aloneLine = (await person.replies(side.id)).find((reply) => reply.id === alone.receipt.reply);
  assert.ok(aloneLine?.text.includes("local/llama") && aloneLine.text.includes("local/qwen"), "with nothing after it, it says which model the thread runs on and which is the agent's default");

  await person.askIn(side.id, "hello");
  await person.ask("in the main thread");
  assert.deepEqual(named(), ["llama", "qwen"], "the thread runs on that model, and the agent's other thread on its own");
  assert.doesNotMatch(shown(0), /local\//, "a session that had never answered is told nothing of its model");

  const back = await person.askIn(side.id, "/model default");
  const backLine = (await person.replies(side.id)).find((reply) => reply.id === back.receipt.reply);
  assert.ok(backLine?.text.includes("local/qwen") && backLine.text.includes("local/llama"), "the agent says that it follows its own model again");
  assert.equal(requests.length, 2, "no request was made for this command either");
  await person.askIn(side.id, "hello again");
  await person.askIn(side.id, "and once more");
  assert.deepEqual(named(), ["llama", "qwen", "qwen", "qwen"]);
  assert.ok(shown(2).includes("local/llama") && shown(2).includes("local/qwen"), "the model that answered next is shown which model wrote the answer before and which it is");
  assert.doesNotMatch(shown(3), /local\//, "and it is shown once, since that answer was written by the model it runs on");
});

test("a /model that names a model the agent can't use is answered in the thread with why and which models it can use, and the thread keeps the model it had", { timeout }, async (t) => {
  const paths = newHome(t, { local: several });
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  await startAt(t, paths.root);
  const person = await talkToAgent(chat, "scout");
  const textOf = async (command: string): Promise<string> => {
    const { receipt } = await person.ask(command);
    assert.equal(receipt.status, "answered");
    return (await person.replies()).find((reply) => reply.id === receipt.reply)?.text ?? "";
  };

  const sameProvider = await textOf("/model local/gpt");
  for (const id of ["llama", "mistral", "qwen"]) assert.ok(sameProvider.includes(id), `${id} is among the models it says it can use`);
  assert.ok((await textOf("/model openai/gpt-5")).includes("local"), "and a provider it has no sign-in for is answered with those it has");
  assert.ok((await textOf("/model")).includes("local/qwen"), "with nothing after it, it says which model the thread runs on");
  await textOf("/model local/qwen");
  await textOf("/model not a model");
  assert.equal(requests.length, 0, "no request was made for any of these");

  await person.ask("hello");
  assert.deepEqual(requests.map((request) => request.body.model), ["qwen"]);
});

test("in a room /model is for the agent it names and for every agent when it says @all, and an agent it does not name neither changes its model nor answers", { timeout }, async (t) => {
  const scout = newHome(t, { local: { ...several, apiKey: "key-scout" } });
  const bob = newHome(t, { local: { ...several, apiKey: "key-bob" } }, "bob");
  const requests = stubChatCompletions(t, "Ok");
  const { chat } = await startNetwork(t);
  await startAt(t, scout.root);
  await startAt(t, bob.root);
  const toScout = await talkToAgent(chat, "scout");
  const toBob = await talkToAgent(chat, "bob");
  const { person, main } = await roomWith(chat, "Ops", [toScout.partner, toBob.partner]);
  const members = { scout: toScout.partner.id, bob: toBob.partner.id };
  const say = (text: string): Promise<Message> => person.chat.post(main.id, text, randomUUID());
  /** The receipt `agent` has left on a message, if it has left one. */
  const receiptOf = async (agent: keyof typeof members, message: Message): Promise<Receipt | undefined> =>
    (await person.chat.read(main.id, null, 200)).find((each) => each.id === message.id)?.receipts.find((receipt) => receipt.memberId === members[agent]);
  const answered = (agent: keyof typeof members, message: Message): Promise<Receipt | undefined> =>
    eventually(() => receiptOf(agent, message), (found) => found !== undefined, { what: `${agent}'s receipt` });
  /** The models each agent's requests named, by the key that tells their homes apart. */
  const named = (key: string): string[] =>
    requests.filter((request) => request.headers.authorization === `Bearer ${key}`).map((request) => request.body.model);

  const onlyScout = await say("@scout /model local/llama");
  assert.equal((await answered("scout", onlyScout))?.status, "answered");
  // Each agent takes the events of the room in order, so once bob has answered this he is past the command.
  const hello = await say("@all hello");
  await Promise.all([answered("scout", hello), answered("bob", hello)]);
  assert.equal(await receiptOf("bob", onlyScout), undefined, "bob was not named and left no receipt");
  assert.deepEqual([named("key-scout"), named("key-bob")], [["llama"], ["qwen"]], "so scout runs on the model and bob on his own");

  const everyone = await say("@all /model local/mistral");
  assert.deepEqual(await Promise.all([answered("scout", everyone), answered("bob", everyone)]).then((all) => all.map((receipt) => receipt?.status)), ["answered", "answered"]);
  const again = await say("@all again");
  await Promise.all([answered("scout", again), answered("bob", again)]);
  assert.deepEqual([named("key-scout"), named("key-bob")], [["llama", "mistral"], ["qwen", "mistral"]]);

  const lines = (await person.chat.read(main.id, null, 200)).filter((message) => message.author.kind === "agent" && message.text !== "Ok");
  assert.deepEqual(lines.map((message) => message.author.id).sort(), [members.bob, members.scout, members.scout].sort(), "scout said a line for each command it was named in, and bob for the one that named everyone");

  // A /model that names nobody is for nobody: no agent acts on it, and no model reads it as text.
  const before = requests.length;
  const nobody = await say("/model local/llama");
  const last = await say("@all last");
  await Promise.all([answered("scout", last), answered("bob", last)]);
  assert.deepEqual([await receiptOf("scout", nobody), await receiptOf("bob", nobody)], [undefined, undefined]);
  assert.equal(requests.length - before, 2, "each agent made one request, for the message after the command");
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

test("no model, or one that cannot be used, stops the start before the home is claimed", { timeout }, async (t) => {
  const unusable = newHome(t, { local: { ...local, apiKey: undefined } });
  // A home that names no model, started with nothing that names one for it.
  const none = newHome(t, { local }, "rex");
  writeFileSync(none.config, JSON.stringify({ name: "rex" }));

  for (const paths of [unusable, none]) {
    await assert.rejects(startHomeAgent(paths.root).then((agent) => closeAfter(t, agent)), ModelSetupError);

    assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
    assert.equal(existsSync(paths.database), false);
  }
});

test("a folder that is not a home is left alone", { timeout }, async (t) => {
  const folder = tempDir(t, "not-a-home");

  await assert.rejects(startHomeAgent(folder).then((agent) => closeAfter(t, agent)), /is not an agent home/);

  assert.deepEqual(readdirSync(folder), []);
  assert.equal(existsSync(homePaths(folder).runtime), false);
});
