import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { SessionItem, SessionView } from "../contracts/agent/index.ts";
import { enterAsPerson, memberNamed } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { loadAll } from "./commands/index.ts";
import {
  commandLines,
  declareLocalModel,
  isAlive,
  type LaunchOptions,
  serve,
  serveChat,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  startScriptedAgent,
  talkTo,
  whyNotACommand,
} from "./testing/index.ts";

/*
 * These tests run the command as people do: every `shrimpy` is its own
 * process, and so are the gateway, the chat server and the agent that
 * `agent serve` starts. A person talks to the agent in a thread on the real
 * chat server.
 *
 * To run a turn against a real model as well, set SHRIMPY_TEST_MODEL_URL to
 * its OpenAI-compatible base URL (ending in /v1) and SHRIMPY_TEST_MODEL_ID to
 * its model ID. The server may need no key; the placeholder "local" is sent.
 */
const realUrl = process.env.SHRIMPY_TEST_MODEL_URL;
const realModel = process.env.SHRIMPY_TEST_MODEL_ID;
const skipWithoutRealModel =
  realUrl === undefined || realModel === undefined ? "set SHRIMPY_TEST_MODEL_URL and SHRIMPY_TEST_MODEL_ID" : false;

/** A home of its own, and a runtime directory of its own for the processes that serve it. */
function tempHome(t: TestContext): string {
  useRuntimeDir(t);
  return join(tempDir(t, "process"), "scout");
}

/**
 * A home whose model is the one at `url`, with the gateway, the chat server and
 * the agent each serving in a process of their own, and a person in a DM with
 * the agent. Everything stops when the test ends. The agent is started with the
 * environment `launch` adds to the test's own, and with a user directory of its
 * own: its shell is a real one, and a model that looks around with `~` should
 * find nothing of the person's.
 */
async function agentOnTheNetwork(t: TestContext, target: { url: string; model: string }, launch?: LaunchOptions) {
  const home = tempHome(t);
  const init = await shrimpy(["agent", "init", home, "--name", "scout", "--model", `local/${target.model}`]);
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, target);
  await startTestGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  const agent = await serve(t, home, [], { env: { HOME: tempDir(t, "user-home"), ...launch?.env } });
  const talk = await talkTo(t, "scout");
  return { home, chat, agent, talk };
}

/** Ask for a command to be run with the shell tool, read the session, and stop the agent. */
async function turnWithShellTool(t: TestContext, target: { url: string; model: string; prompt: string }) {
  const { home, agent, talk } = await agentOnTheNetwork(t, target);
  assert.equal(agent.listening.event, "listening");
  assert.equal(agent.listening.name, "scout");
  assert.equal(agent.listening.home, home);

  const status = await shrimpy(["agent", "status", home]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal((JSON.parse(status.stdout) as { pid: number }).pid, agent.listening.pid);

  const asked = await talk.say(target.prompt);
  const receipt = await talk.receiptOn(asked, 240_000);
  assert.equal(receipt.status, "answered", JSON.stringify(receipt));
  const replies = await talk.replies();
  assert.notEqual(replies.at(-1)?.text.trim(), "", "the answer is posted in the thread");
  assert.equal(receipt.reply, replies.at(-1)?.id);

  const listed = await shrimpy(["sessions", "list", home]);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok(listed.stdout.includes(talk.thread.id) && listed.stdout.includes("idle"), listed.stdout);

  const read = await shrimpy(["sessions", "read", home, talk.thread.id, "--json"]);
  assert.equal(read.code, 0, read.stderr);
  const view = JSON.parse(read.stdout) as SessionView;
  const tool = view.items.find((item): item is Extract<SessionItem, { type: "tool" }> => item.type === "tool");
  assert.ok(tool, "the session shows the tool call");
  assert.equal(tool.name, "bash");
  assert.equal(tool.status, "done");
  assert.match(tool.output, /shrimpy-ok/);
  assert.deepEqual(view.status.activity, { kind: "idle" });
  assert.deepEqual(view.status.model, { provider: "local", id: target.model });

  const stopped = await agent.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(isAlive(agent.listening.pid), false);
  assert.equal((await shrimpy(["agent", "status", home])).code, 1);
}

test("a message to the agent in a thread becomes a turn with the shell tool, against a model it talks to over HTTP, and the reply comes back", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());

  await turnWithShellTool(t, { url: model.url, model: "test-model", prompt: "run the command" });

  assert.ok(model.requests.every((request) => request.headers.authorization === "Bearer local"));
  // The model's own thinking goes back to it with the history, from what the agent stored.
  const earlierAnswer = model.requests[1]?.body.messages.find((message) => message.role === "assistant");
  assert.equal(earlierAnswer?.reasoning_content, "Let me think about it.");
});

test(
  "a message to the agent in a thread becomes a turn with the shell tool against a real model",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    await turnWithShellTool(t, {
      url: realUrl ?? "",
      model: realModel ?? "",
      prompt: "Use your bash tool to run exactly this command: echo shrimpy-ok. Then tell me what it printed.",
    });
  },
);

test(
  "an agent on a real model stays silent with END when told to say nothing, and answers otherwise",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    const { talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });
    const before = (await talk.replies()).length;

    const quiet = await talk.say(
      "Nothing needs saying about this message. Reply with the single word END in capital letters, and nothing else.",
    );

    const silent = await talk.receiptOn(quiet, 240_000);
    assert.equal(silent.status, "silent", JSON.stringify(silent));
    await delay(500);
    assert.equal((await talk.replies()).length, before, "and nothing was posted");

    const asked = await talk.say("What is two plus two? Answer in one short sentence.");
    const answered = await talk.receiptOn(asked, 240_000);
    assert.equal(answered.status, "answered", JSON.stringify(answered));
    const reply = (await talk.replies()).at(-1);
    assert.equal(answered.reply, reply?.id);
    assert.match(reply?.text ?? "", /\b(4|four)\b/i);
  },
);

test(
  "an agent on a real model stays silent when the conversation has plainly ended, without being told to",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    const { talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });

    const asked = await talk.say("What is two plus two? Answer in one short sentence.");
    const answered = await talk.receiptOn(asked, 240_000);
    assert.equal(answered.status, "answered", JSON.stringify(answered));
    const before = (await talk.replies()).length;

    const goodbye = await talk.say("Great, thanks. That's all I needed. Bye!");

    const silent = await talk.receiptOn(goodbye, 240_000);
    assert.equal(silent.status, "silent", JSON.stringify({ receipt: silent, replies: (await talk.replies()).map((reply) => reply.text) }));
    await delay(500);
    assert.equal((await talk.replies()).length, before, "and nothing was posted");
  },
);

/** The tool calls the agent made in a thread's session, with their arguments and how each ended. */
async function toolItemsIn(home: string, thread: string): Promise<Extract<SessionItem, { type: "tool" }>[]> {
  const read = await shrimpy(["sessions", "read", home, thread, "--json"]);
  assert.equal(read.code, 0, read.stderr);
  const view = JSON.parse(read.stdout) as SessionView;
  return view.items.flatMap((item) => (item.type === "tool" ? [item] : []));
}

/** The tool calls the agent made in a thread's session, by name, with how each ended. */
async function toolCallsIn(home: string, thread: string): Promise<[string, string][]> {
  return (await toolItemsIn(home, thread)).map((item) => [item.name, item.status]);
}

test(
  "an agent on a real model tells the thread it has started with send_message, and the final text is still its reply",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    const { home, talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });

    const asked = await talk.say(
      "Run `uname -s` with your shell tool. First tell me right away that you have started, then give me the result.",
    );

    const receipt = await talk.receiptOn(asked, 240_000);
    assert.equal(receipt.status, "answered", JSON.stringify(receipt));
    const replies = await talk.replies();
    assert.ok(replies.length >= 2, "something was said along the way, and then the reply");
    assert.equal(receipt.reply, replies.at(-1)?.id, "the receipt points at the final text, not at what was sent along the way");
    assert.match(replies.at(-1)?.text ?? "", /Darwin|Linux/i);
    const calls = await toolCallsIn(home, talk.thread.id);
    assert.ok(calls.some(([name, status]) => name === "send_message" && status === "done"), JSON.stringify(calls));
  },
);

test(
  "an agent on a real model reads the thread back with read_messages when asked what was said before",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    const { home, talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });
    await talk.receiptOn(await talk.say("My favourite colour is teal. Just say OK."), 240_000);
    await talk.receiptOn(await talk.say("My favourite number is 42. Just say OK."), 240_000);

    const asked = await talk.say("Use your read_messages tool to look back at this thread, then tell me my favourite colour.");

    const receipt = await talk.receiptOn(asked, 240_000);
    assert.equal(receipt.status, "answered", JSON.stringify(receipt));
    assert.match((await talk.replies()).at(-1)?.text ?? "", /teal/i);
    const calls = await toolCallsIn(home, talk.thread.id);
    assert.ok(calls.some(([name, status]) => name === "read_messages" && status === "done"), JSON.stringify(calls));
  },
);

test(
  "an agent on a real model reads the skill for making an agent, and answers with commands that exist",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    const { home, talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });

    const asked = await talk.say("How do I make another agent, one called maya? Just tell me the commands, don't run anything.");

    const receipt = await talk.receiptOn(asked, 240_000);
    assert.equal(receipt.status, "answered", JSON.stringify(receipt));
    const reply = (await talk.replies()).at(-1)?.text ?? "";
    const tools = await toolItemsIn(home, talk.thread.id);
    const readIt = tools.some((tool) => tool.args.includes("shrimpy-agents/SKILL.md"));
    assert.ok(readIt, `it never read the skill. It did: ${JSON.stringify(tools.map((tool) => [tool.name, tool.args]))}\nand answered: ${reply}`);
    const lines = commandLines(reply);
    const commands = await loadAll();
    assert.ok(lines.some((line) => line.startsWith("shrimpy agent init")), `no agent init in the answer: ${reply}`);
    assert.deepEqual(lines.flatMap((line) => whyNotACommand(line, commands) ?? []), [], reply);
  },
);

test("the agent's shell finds shrimpy, though the PATH the agent was started with has none, and it is this Shrimpy", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const { home, talk } = await agentOnTheNetwork(t, { url: model.url, model: "test-model" }, { env: { PATH: "/usr/bin:/bin" } });

  const asked = await talk.say("which shrimpy");

  const receipt = await talk.receiptOn(asked);
  assert.equal(receipt.status, "answered", JSON.stringify(receipt));
  const read = await shrimpy(["sessions", "read", home, talk.thread.id, "--json"]);
  const tool = (JSON.parse(read.stdout) as SessionView).items.find(
    (item): item is Extract<SessionItem, { type: "tool" }> => item.type === "tool",
  );
  assert.equal(tool?.status, "done");
  assert.equal(tool.output.split("\n")[0], join(home, "runtime", "bin", "shrimpy"), "the shell finds the agent's own launcher");
  assert.match(tool.output, /^agent\s+scout\s+0\.0\.0$/m, "and it reaches this machine's gateway, which lists the agent");
});

test("a shrimpy command in an agent's shell speaks as that agent, and the same command in a person's terminal speaks as the person", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const { talk } = await agentOnTheNetwork(t, { url: model.url, model: "test-model" });
  const mechanic = await startScriptedAgent(t, { name: "mechanic", handle: () => ({ status: "silent" }) });
  const person = (await enterAsPerson(t)).me;
  const scout = await memberNamed(t, "scout");

  // The test model has the agent run `shrimpy run mechanic "hello from my shell" --no-wait` in its shell.
  const asked = await talk.say("post from the shell");
  assert.equal((await talk.receiptOn(asked)).status, "answered");
  await until(() => mechanic.offered.length === 1, "the mechanic to be offered what the agent's shell posted");
  const posted = await shrimpy(["run", "mechanic", "hello from my shell", "--no-wait"]);
  await until(() => mechanic.offered.length === 2, "the mechanic to be offered what the person's command posted");

  assert.equal(posted.code, 0, posted.stderr);
  const [fromAgent, fromPerson] = mechanic.offered;
  assert.deepEqual([fromAgent?.text, fromAgent?.actor.id], ["hello from my shell", scout.id]);
  assert.deepEqual([fromPerson?.text, fromPerson?.actor.id], ["hello from my shell", person.id]);
  assert.notEqual(scout.id, person.id);
});

test("a command killed while it waits does not stop the work", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const { home, agent, talk } = await agentOnTheNetwork(t, { url: model.url, model: "test-model" });
  const thread = talk.thread.id;
  const answerLength = async (): Promise<number> => {
    const read = await shrimpy(["sessions", "read", home, thread, "--json"]);
    const view = JSON.parse(read.stdout) as SessionView;
    return view.items.reduce((length, item) => length + (item.type === "assistant" ? item.text.length : 0), 0);
  };
  // Steering needs a session, and the agent makes one for a thread when its first message arrives.
  await talk.receiptOn(await talk.say("hello"));
  const asked = model.requests.length;

  const waiting = shrimpyInBackground(["sessions", "steer", home, thread, "go slow", "--wait"]);
  await until(() => model.requests.length > asked, "the model to start answering");
  waiting.kill("SIGKILL");
  await waiting.finished;

  // The answer keeps growing with no one waiting for it, until someone stops the work.
  const before = await answerLength();
  await eventually(answerLength, (length) => length > before, { what: "the answer to keep streaming" });
  const stopped = await shrimpy(["sessions", "stop", home, thread]);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal((await agent.stop()).code, 0);
});

test("a stop signal the moment the agent is listening stops it cleanly, and frees the home", { timeout: 60_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const home = tempHome(t);
  await shrimpy(["agent", "init", home, "--name", "scout", "--model", "local/test-model"]);
  declareLocalModel(home, { url: model.url, model: "test-model" });

  // Whatever supervises the agent may signal as soon as it reads the listening line.
  const first = await serve(t, home);
  const second = await shrimpy(["agent", "serve", home]);
  const interrupted = await first.stop("SIGINT");
  const again = await serve(t, home);
  const terminated = await again.stop("SIGTERM");

  assert.equal(second.code, 1);
  assert.match(second.stderr, /Another process owns the agent home/);
  assert.equal(interrupted.code, 0, interrupted.stderr);
  assert.equal(terminated.code, 0, terminated.stderr);
  assert.equal(isAlive(first.listening.pid) || isAlive(again.listening.pid), false);
});
