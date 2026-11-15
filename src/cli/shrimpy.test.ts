import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { SessionItem, SessionStatus } from "../contracts/agent/index.ts";
import { enterAsPerson, memberNamed } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import {
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
 * How a real model behaves is reported, never asserted.
 */
const realUrl = process.env.SHRIMPY_TEST_MODEL_URL;
const realModel = process.env.SHRIMPY_TEST_MODEL_ID;
const skipWithoutRealModel =
  realUrl === undefined || realModel === undefined ? "set SHRIMPY_TEST_MODEL_URL and SHRIMPY_TEST_MODEL_ID" : false;

/** What `sessions read --json` prints: the whole session, and what it is doing. */
type SessionView = { items: SessionItem[]; status: SessionStatus };

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

  const status = await shrimpy(["agent", "status", "--agent", home]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal((JSON.parse(status.stdout) as { pid: number }).pid, agent.listening.pid);

  const asked = await talk.say(target.prompt);
  const receipt = await talk.receiptOn(asked, 240_000);
  assert.equal(receipt.status, "answered", JSON.stringify(receipt));
  const replies = await talk.replies();
  assert.notEqual(replies.at(-1)?.text.trim(), "", "the answer is posted in the thread");
  assert.equal(receipt.reply, replies.at(-1)?.id);

  const listed = await shrimpy(["sessions", "list", "--agent", home]);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok(listed.stdout.includes(talk.thread.id) && listed.stdout.includes("idle"), listed.stdout);

  const read = await shrimpy(["sessions", "read", talk.thread.id, "--json", "--agent", home]);
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
  assert.equal((await shrimpy(["agent", "status", "--agent", home])).code, 1);
}

test("a message in a thread becomes a turn with the shell tool against a model over HTTP", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());

  await turnWithShellTool(t, { url: model.url, model: "test-model", prompt: "run the command" });

  assert.ok(model.requests.every((request) => request.headers.authorization === "Bearer local"));
  // The model's own thinking goes back to it with the history, from what the agent stored.
  const earlierAnswer = model.requests[1]?.body.messages.find((message) => message.role === "assistant");
  assert.equal(earlierAnswer?.reasoning_content, "Let me think about it.");
});

test(
  "a turn against a real model ends without a failure",
  { timeout: 300_000, skip: skipWithoutRealModel },
  async (t) => {
    // What the model chooses to do is its own. That the server takes what the agent sends it, and the agent reads its answer, is Shrimpy's.
    const { home, talk } = await agentOnTheNetwork(t, { url: realUrl ?? "", model: realModel ?? "" });

    const receipt = await talk.receiptOn(await talk.say("Say hello, then tell me what you can do."), 240_000);

    assert.notEqual(receipt.status, "failed", JSON.stringify(receipt));
    const read = await shrimpy(["sessions", "read", talk.thread.id, "--json", "--agent", home]);
    assert.equal(read.code, 0, read.stderr);
    assert.equal((JSON.parse(read.stdout) as SessionView).status.failure, null);
  },
);

test("the agent's shell finds this Shrimpy, though the agent's PATH has none", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const { home, talk } = await agentOnTheNetwork(t, { url: model.url, model: "test-model" }, { env: { PATH: "/usr/bin:/bin" } });

  const asked = await talk.say("which shrimpy");

  const receipt = await talk.receiptOn(asked);
  assert.equal(receipt.status, "answered", JSON.stringify(receipt));
  const read = await shrimpy(["sessions", "read", talk.thread.id, "--json", "--agent", home]);
  const tool = (JSON.parse(read.stdout) as SessionView).items.find(
    (item): item is Extract<SessionItem, { type: "tool" }> => item.type === "tool",
  );
  assert.equal(tool?.status, "done");
  const [launcher, ...status] = tool.output.split("\n");
  assert.equal(launcher, join(home, "runtime", "bin", "shrimpy"), "the shell finds the agent's own launcher");
  assert.ok(status.some((line) => line.includes("scout") && line.includes(SHRIMPY_VERSION)), "and it reaches this machine's gateway, which lists the agent");
});

test("a shrimpy command speaks as the agent in its shell, and as the person in theirs", { timeout: 120_000 }, async (t) => {
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
    const read = await shrimpy(["sessions", "read", thread, "--json", "--agent", home]);
    const view = JSON.parse(read.stdout) as SessionView;
    return view.items.reduce((length, item) => length + (item.type === "assistant" ? item.text.length : 0), 0);
  };
  // Steering needs a session, and the agent makes one for a thread when its first message arrives.
  await talk.receiptOn(await talk.say("hello"));
  const asked = model.requests.length;

  const waiting = shrimpyInBackground(["sessions", "steer", thread, "go slow", "--wait", "--agent", home]);
  await until(() => model.requests.length > asked, "the model to start answering");
  waiting.kill("SIGKILL");
  await waiting.finished;

  // The answer keeps growing with no one waiting for it, until someone stops the work.
  const before = await answerLength();
  await eventually(answerLength, (length) => length > before, { what: "the answer to keep streaming" });
  const stopped = await shrimpy(["sessions", "stop", thread, "--agent", home]);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal((await agent.stop()).code, 0);
});

test("a stop signal the moment the agent listens stops it cleanly, and frees the home", { timeout: 60_000 }, async (t) => {
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
  assert.ok(second.stderr.includes(home), "the home is another process's");
  assert.equal(interrupted.code, 0, interrupted.stderr);
  assert.equal(terminated.code, 0, terminated.stderr);
  assert.equal(isAlive(first.listening.pid) || isAlive(again.listening.pid), false);
});
