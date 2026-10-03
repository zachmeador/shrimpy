import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { SessionView } from "../contracts/agent/index.ts";
import { runCli } from "./index.ts";
import { captureIo, declareLocalModel, eventually, type ModelServer, startModelServer } from "./testing/index.ts";

const timeout = 60_000;

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err };
}

interface ServedHome {
  home: string;
  model: ModelServer;
  /** Stop the agent as one SIGTERM would, and resolve with the exit code of `agent serve`. */
  stop: () => Promise<number>;
  /** Stop it as two would: without waiting for running turns. */
  stopNow: () => Promise<number>;
}

/** A home that talks to the test model, with its agent serving in this process. Both stop when the test ends. */
async function servedHome(t: TestContext): Promise<ServedHome> {
  const model = await startModelServer();
  const home = join(mkdtempSync(join(tmpdir(), "shrimpy-flow-")), "scout");
  assert.equal((await run("agent", "init", home, "--name", "scout", "--model", "local/test-model")).code, 0);
  declareLocalModel(home, { url: model.url, model: "test-model" });

  const serving = captureIo();
  const done = runCli(["agent", "serve", home], serving.io);
  const stop = (): Promise<number> => {
    serving.requestStop();
    return done;
  };
  const stopNow = (): Promise<number> => {
    serving.requestStop();
    return stop();
  };
  t.after(async () => {
    await stopNow();
    await model.close();
  });
  await Promise.race([
    serving.nextOut((line) => line.includes('"event":"listening"')),
    done.then((code) => {
      throw new Error(`agent serve ended with ${code}: ${serving.err.join("\n")}`);
    }),
  ]);
  return { home, model, stop, stopNow };
}

test("a turn that uses a shell tool runs through the CLI from init to stop", { timeout }, async (t) => {
  const { home, model, stop } = await servedHome(t);

  const status = await run("agent", "status", home);
  assert.equal(status.code, 0);
  const running = JSON.parse(status.out[0] ?? "") as Record<string, unknown>;
  assert.equal(running.running, true);
  assert.equal(running.home, home);
  assert.equal(running.pid, process.pid);

  assert.deepEqual((await run("sessions", "list", home)).out, ["1 main"]);

  const steered = await run("sessions", "steer", home, "run the command", "--wait");
  assert.equal(steered.code, 0);
  assert.deepEqual(steered.out, ["The command printed: shrimpy-ok"]);
  assert.deepEqual(steered.err, []);

  const transcript = (await run("sessions", "read", home)).out.join("\n");
  assert.match(transcript, /^you\n {2}run the command\n/);
  assert.match(transcript, /\ntool bash \(done\)\n {2}\{"command":"echo shrimpy-ok"\}\n {2}shrimpy-ok\n/);
  assert.match(transcript, /\nassistant\n {2}The command printed: shrimpy-ok\n\nidle · local\/test-model · /);

  const json = (await run("sessions", "read", home, "--json")).out;
  assert.equal(json.length, 1);
  const view = JSON.parse(json[0] ?? "") as SessionView;
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "tool", "assistant"],
  );
  assert.deepEqual(view.status.model, { provider: "local", id: "test-model" });

  // The placeholder key reached the server, and the flags in models.json shaped the request.
  assert.ok(model.requests.length >= 2);
  for (const request of model.requests) {
    assert.equal(request.headers.authorization, "Bearer local");
    assert.equal(request.body.model, "test-model");
    assert.equal(request.body.messages[0]?.role, "system");
  }

  assert.equal(await stop(), 0);
  const after = await run("agent", "status", home);
  assert.equal(after.code, 1);
  assert.deepEqual(JSON.parse(after.out[0] ?? ""), { running: false, home });
});

test("input without --wait is accepted at once, and a retry with the same ID is the same input", { timeout }, async (t) => {
  const { home } = await servedHome(t);

  const first = await run("sessions", "steer", home, "hello", "--request-id", "greeting-1");
  const retry = await run("sessions", "steer", home, "hello", "--request-id", "greeting-1", "--wait");

  assert.equal(first.code, 0);
  const accepted = /^Accepted as submission (\d+)\.$/.exec(first.out[0] ?? "");
  assert.ok(accepted, first.out.join("\n"));
  assert.deepEqual(retry.out, ["Hello from the test model."]);
  assert.equal(retry.code, 0);
  // Only one input reached the session.
  const items = (JSON.parse((await run("sessions", "read", home, "--json")).out[0] ?? "") as SessionView).items;
  assert.equal(items.filter((item) => item.type === "user").length, 1);
});

test("stopping the work makes the waiting command exit 130", { timeout }, async (t) => {
  const { home, model } = await servedHome(t);

  const waiting = run("sessions", "steer", home, "go slow", "--wait");
  await eventually(() => model.requests.length > 0, "the model to start answering");
  const stopped = await run("sessions", "stop", home);
  const result = await waiting;

  assert.equal(stopped.code, 0);
  assert.deepEqual(stopped.out, ["Cancelled the work in the main session."]);
  assert.equal(result.code, 130);
  assert.deepEqual(result.out, []);
  assert.deepEqual(result.err, ["The input was cancelled before it was answered."]);
  // The agent is still there, and can be asked again.
  assert.equal((await run("sessions", "steer", home, "hello", "--wait")).code, 0);
});

test("input the model refuses makes the waiting command exit 1, with the reason", { timeout }, async (t) => {
  const { home } = await servedHome(t);

  const result = await run("sessions", "steer", home, "please refuse", "--wait");

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.equal(result.err.length, 1);
  assert.match(result.err[0] ?? "", /^The input ended without an answer \(model_error: .*The test model refuses this request\./);
});

test("a second agent on a home is refused, and the first keeps serving", { timeout }, async (t) => {
  const { home } = await servedHome(t);

  const second = await run("agent", "serve", home);

  assert.equal(second.code, 1);
  assert.match(second.err.join("\n"), /Another process owns the agent home at /);
  assert.equal((await run("agent", "status", home)).code, 0);
});

test("a waiting command says so when the agent stops under it", { timeout }, async (t) => {
  const { home, model, stopNow } = await servedHome(t);
  const waiting = run("sessions", "steer", home, "go slow", "--wait");
  await eventually(() => model.requests.length > 0, "the model to start answering");

  assert.equal(await stopNow(), 0);
  const result = await waiting;

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.deepEqual(result.err, [
    "Lost the connection to the agent. If it stopped, the work that was running resumes when it starts again.",
  ]);
});
