import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { SessionItem, SessionView } from "../contracts/agent/index.ts";
import { tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A home whose model is the one at `url`, with the gateway, the chat server and
 * the agent each serving in a process of their own, and a person who has talked
 * to the agent enough to know it is there. Everything stops when the test ends.
 */
async function agentOnTheNetwork(t: TestContext, target: { url: string; model: string }) {
  const home = tempHome(t);
  const init = await shrimpy(["agent", "init", home, "--name", "scout", "--model", `local/${target.model}`]);
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, target);
  await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  const agent = await serve(t, home);
  const talk = await talkTo(t, chat.listening, "scout");
  await talk.awaitAgent();
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
  assert.equal(listed.stdout.trim(), `${talk.thread.id} ${talk.thread.channelId} idle`);

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
  assert.equal(stopped.stdout.trim().split("\n").length, 1, "serve prints only the listening line");
  assert.equal(isAlive(agent.listening.pid), false);
  assert.equal((await shrimpy(["agent", "status", home])).code, 1);
}

test("a message to the agent in a thread becomes a turn with the shell tool, against a model it talks to over HTTP, and the reply comes back", { timeout: 120_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());

  await turnWithShellTool(t, { url: model.url, model: "test-model", prompt: "run the command" });

  assert.ok(model.requests.every((request) => request.headers.authorization === "Bearer local"));
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
  const asked = model.requests.length;

  const waiting = shrimpyInBackground(["sessions", "steer", home, thread, "go slow", "--wait"]);
  await until(() => model.requests.length > asked, "the model to start answering");
  waiting.kill("SIGKILL");
  await waiting.finished;

  // The answer keeps growing with no one waiting for it, until someone stops the work.
  const before = await answerLength();
  await delay(400);
  assert.ok((await answerLength()) > before, "the answer kept streaming");
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
