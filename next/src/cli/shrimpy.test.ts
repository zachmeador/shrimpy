import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { SessionItem, SessionView } from "../contracts/agent/index.ts";
import {
  declareLocalModel,
  eventually,
  serve,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
} from "./testing/index.ts";

/*
 * These tests run the command as people do: every `shrimpy` is its own
 * process, and so is the agent that `agent serve` starts.
 *
 * To run a turn against a real model as well, set SHRIMPY_TEST_MODEL_URL to
 * its OpenAI-compatible base URL (ending in /v1) and SHRIMPY_TEST_MODEL_ID to
 * its model ID. The server may need no key; the placeholder "local" is sent.
 */
const realUrl = process.env.SHRIMPY_TEST_MODEL_URL;
const realModel = process.env.SHRIMPY_TEST_MODEL_ID;

function tempHome(): string {
  return join(mkdtempSync(join(tmpdir(), "shrimpy-process-")), "scout");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Create a home, serve it, ask for a command to be run with the shell tool, read the session, and stop the agent. */
async function turnWithShellTool(t: TestContext, target: { url: string; model: string; prompt: string }) {
  const home = tempHome();
  const init = await shrimpy(["agent", "init", home, "--name", "scout", "--model", `local/${target.model}`]);
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, target);

  const agent = await serve(t, home);
  assert.equal(agent.listening.event, "listening");
  assert.equal(agent.listening.name, "scout");
  assert.equal(agent.listening.home, home);

  const status = await shrimpy(["agent", "status", home]);
  assert.equal(status.code, 0, status.stderr);
  assert.equal((JSON.parse(status.stdout) as { pid: number }).pid, agent.listening.pid);

  const steered = await shrimpy(["sessions", "steer", home, target.prompt, "--wait"]);
  assert.equal(steered.code, 0, `${steered.stdout}\n${steered.stderr}`);
  assert.notEqual(steered.stdout.trim(), "", "the answer is printed");

  const read = await shrimpy(["sessions", "read", home, "--json"]);
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

test("the command runs a turn with the shell tool against a model it talks to over HTTP", { timeout: 60_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());

  await turnWithShellTool(t, { url: model.url, model: "test-model", prompt: "run the command" });

  assert.ok(model.requests.every((request) => request.headers.authorization === "Bearer local"));
});

test(
  "the command runs a turn with the shell tool against a real model",
  {
    timeout: 300_000,
    skip: realUrl === undefined || realModel === undefined ? "set SHRIMPY_TEST_MODEL_URL and SHRIMPY_TEST_MODEL_ID" : false,
  },
  async (t) => {
    await turnWithShellTool(t, {
      url: realUrl ?? "",
      model: realModel ?? "",
      prompt: "Use your bash tool to run exactly this command: echo shrimpy-ok. Then tell me what it printed.",
    });
  },
);

test("a command killed while it waits does not stop the work", { timeout: 60_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const home = tempHome();
  await shrimpy(["agent", "init", home, "--name", "scout", "--model", "local/test-model"]);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  const agent = await serve(t, home);
  const answerLength = async (): Promise<number> => {
    const read = await shrimpy(["sessions", "read", home, "--json"]);
    const view = JSON.parse(read.stdout) as SessionView;
    return view.items.reduce((length, item) => length + (item.type === "assistant" ? item.text.length : 0), 0);
  };

  const waiting = shrimpyInBackground(["sessions", "steer", home, "go slow", "--wait"]);
  await eventually(() => model.requests.length > 0, "the model to start answering");
  waiting.kill("SIGKILL");
  await waiting.finished;

  // The answer keeps growing with no one waiting for it, until someone stops the work.
  const before = await answerLength();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok((await answerLength()) > before, "the answer kept streaming");
  const stopped = await shrimpy(["sessions", "stop", home]);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal((await agent.stop()).code, 0);
});

test("a stop signal the moment the agent is listening stops it cleanly, and frees the home", { timeout: 60_000 }, async (t) => {
  const model = await startModelServer();
  t.after(() => model.close());
  const home = tempHome();
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
