import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { agentMember, type Member, type Message, type Thread } from "../contracts/chat/index.ts";
import { type StandInChat, startStandInChat } from "../contracts/chat/testing/index.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import type { SessionView } from "../contracts/agent/index.ts";
import { eventually, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import {
  captureIo,
  declareLocalModel,
  type ModelServer,
  startModelServer,
} from "./testing/index.ts";

const timeout = 60_000;

const zach: Member = { id: "person:zach", kind: "person", name: "Zach" };

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err };
}

interface ServedHome {
  home: string;
  model: ModelServer;
  chat: StandInChat;
  /** The main thread of Zach's DM with the agent. */
  thread: Thread;
  /** Zach says something in the thread, and the message is returned once the agent has left its receipt on it. */
  ask: (text: string) => Promise<Message>;
  /** Zach says something in the thread, and the message is returned at once. */
  tell: (text: string) => Message;
  /** Stop the agent as one SIGTERM would, and resolve with the exit code of `agent serve`. */
  stop: () => Promise<number>;
  /** Stop it as two would: without waiting for running turns. */
  stopNow: () => Promise<number>;
}

/**
 * A home that talks to the test model, with its agent serving in this process
 * (`agent serve <home> ...serveFlags`) and finding chat through a gateway. All
 * of it stops when the test ends.
 */
async function servedHome(t: TestContext, ...serveFlags: string[]): Promise<ServedHome> {
  useRuntimeDir(t);
  const model = await startModelServer();
  const gateway = await startStandInGateway(t);
  const chat = await startStandInChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "chat to be listed with the gateway");
  const home = join(tempDir(t, "flow"), "scout");
  assert.equal((await run("agent", "init", home, "--name", "scout", "--model", "local/test-model")).code, 0);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  const { thread } = chat.chat.dm(zach, agentMember("scout"));

  const serving = captureIo();
  const done = runCli(["agent", "serve", home, ...serveFlags], serving.io);
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
  await until(() => chat.chat.calls("feed") >= 1, "the agent to read chat's feed");

  const tell = (text: string): Message => chat.chat.say(zach, thread.id, text);
  const ask = async (text: string): Promise<Message> => {
    const said = tell(text);
    await eventually(
      () => chat.chat.messages().find((message) => message.id === said.id)?.receipts[0],
      (receipt) => receipt !== undefined,
      { what: `the agent to answer "${text}"` },
    );
    return said;
  };
  return { home, model, chat, thread, ask, tell, stop, stopNow };
}

test("a turn that uses a shell tool runs from init to stop, and the session is read through the CLI", { timeout }, async (t) => {
  const { home, model, chat, thread, ask, stop } = await servedHome(t);

  const status = await run("agent", "status", home);
  assert.equal(status.code, 0);
  const running = JSON.parse(status.out[0] ?? "") as Record<string, unknown>;
  assert.equal(running.running, true);
  assert.equal(running.home, home);
  assert.equal(running.pid, process.pid);

  assert.deepEqual((await run("sessions", "list", home)).out, ["The agent has no sessions yet."]);

  await ask("run the command");
  assert.deepEqual(
    chat.chat.messages(thread.id).filter((message) => message.author.id === "agent:scout").map((message) => message.text),
    ["The command printed: shrimpy-ok"],
  );
  assert.deepEqual((await run("sessions", "list", home)).out, [`${thread.id} ${thread.channelId} idle`]);

  const transcript = (await run("sessions", "read", home, thread.id)).out.join("\n");
  assert.match(
    transcript,
    /^you\n {2}Thread th_\w+ in channel ch_\w+\.\n {2}\n {2}Zach wrote at \d{4}-\d\d-\d\dT[\d:]{8}Z:\n {2}run the command\n/,
  );
  assert.match(transcript, /\ntool bash \(done\)\n {2}\{"command":"echo shrimpy-ok"\}\n {2}shrimpy-ok\n/);
  assert.match(transcript, /\nassistant\n {2}The command printed: shrimpy-ok\n\nidle · local\/test-model · /);

  const json = (await run("sessions", "read", home, thread.id, "--json")).out;
  assert.equal(json.length, 1);
  const view = JSON.parse(json[0] ?? "") as SessionView;
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "tool", "assistant"],
  );
  assert.deepEqual(view.status.model, { provider: "local", id: "test-model" });
  const thinking = view.items.flatMap((item) => (item.type === "assistant" ? [item.thinking] : []));
  assert.deepEqual(thinking, ["Let me think about it.", "Let me think about it."]);

  // The placeholder key reached the server, and the flags in models.json shaped the request.
  assert.equal(model.requests.length, 2);
  for (const request of model.requests) {
    assert.equal(request.headers.authorization, "Bearer local");
    assert.equal(request.body.model, "test-model");
    assert.equal(request.body.messages[0]?.role, "system");
  }
  // The model's own thinking goes back to it with the history, from what the agent stored.
  const earlierAnswer = model.requests[1]?.body.messages.find((message) => message.role === "assistant");
  assert.equal(earlierAnswer?.reasoning_content, "Let me think about it.");

  assert.equal(await stop(), 0);
  const after = await run("agent", "status", home);
  assert.equal(after.code, 1);
  assert.deepEqual(JSON.parse(after.out[0] ?? ""), { running: false, home });
});

test("agent reload makes the running agent read its home again, and says what it found and what it left out", { timeout }, async (t) => {
  const { home, model, ask } = await servedHome(t);
  const told = (index: number): string => String(model.requests[index]?.body.messages[0]?.content);
  await ask("hello");
  writeFileSync(join(home, "SOUL.md"), "Answer in rhyme.\n");
  writeFileSync(join(home, "context", "team.md"), "The team is small.\n");
  mkdirSync(join(home, "skills", "broken"));
  writeFileSync(join(home, "skills", "broken", "SKILL.md"), "# no front matter\n");
  await ask("hello again");
  assert.doesNotMatch(told(1), /Answer in rhyme\./, "nothing changes until the agent is told to read again");

  const reloaded = await run("agent", "reload", home);

  assert.equal(reloaded.code, 0, reloaded.err.join("\n"));
  assert.deepEqual(reloaded.out, [
    `Reloaded. The agent at ${home} now reads SOUL.md and 1 context file. Each of its sessions uses the change with its next request.`,
    "Left out:\n  skills/broken/SKILL.md: it does not start with a front matter block, between --- lines",
  ]);
  await ask("and once more");
  assert.match(told(2), /<soul>\nAnswer in rhyme\.\n<\/soul>/);
  assert.match(told(2), /<file path="context\/team\.md">\nThe team is small\.\n<\/file>/);
});

test("agent reload says when there is no agent to read again, and needs a home", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = join(tempDir(t, "flow"), "scout");
  assert.equal((await run("agent", "init", home, "--name", "scout", "--model", "local/test-model")).code, 0);

  const none = await run("agent", "reload", home);
  const unused = await run("agent", "reload");

  assert.equal(none.code, 1);
  assert.deepEqual(none.err, [`No agent is running at ${home}. Start one with: shrimpy agent serve ${home}`]);
  assert.equal(unused.code, 2);
  assert.equal(unused.err[0], "Missing <home>.");
});

test("a session that is working says so in the list", { timeout }, async (t) => {
  const { home, thread, tell } = await servedHome(t);
  tell("go slow");

  await eventually(
    () => run("sessions", "list", home),
    (listed) => listed.out[0]?.endsWith(" working") === true,
    { what: "the session to be working" },
  );

  assert.equal((await run("sessions", "stop", home, thread.id)).code, 0);
});

test("a thread the agent has no session for is refused with a message that says so", { timeout }, async (t) => {
  const { home } = await servedHome(t);

  for (const args of [["read"], ["stop"], ["steer", "hello"]]) {
    const result = await run("sessions", args[0] ?? "", home, "th_nothing", ...args.slice(1));
    assert.equal(result.code, 1, args.join(" "));
    assert.deepEqual(result.err, ["This agent has no session for thread th_nothing yet."]);
  }
});

test("input without --wait is accepted at once, and a retry with the same ID is the same input", { timeout }, async (t) => {
  const { home, thread, ask } = await servedHome(t);
  await ask("first");

  const first = await run("sessions", "steer", home, thread.id, "hello", "--request-id", "greeting-1");
  const retry = await run("sessions", "steer", home, thread.id, "hello", "--request-id", "greeting-1", "--wait");

  assert.equal(first.code, 0);
  const accepted = /^Accepted as submission (\d+)\.$/.exec(first.out[0] ?? "");
  assert.ok(accepted, first.out.join("\n"));
  assert.deepEqual(retry.out, ["Hello from the test model."]);
  assert.equal(retry.code, 0);
  // Only one input reached the session.
  const items = (JSON.parse((await run("sessions", "read", home, thread.id, "--json")).out[0] ?? "") as SessionView).items;
  assert.equal(items.filter((item) => item.type === "user" && item.text === "hello").length, 1);
});

test("stopping the work makes the waiting command exit 130, and the message in the thread is marked stopped", { timeout }, async (t) => {
  const { home, model, chat, thread, ask, tell } = await servedHome(t);
  await ask("first");

  const waiting = run("sessions", "steer", home, thread.id, "go slow", "--wait");
  await until(() => model.requests.length > 1, "the model to start answering");
  const stopped = await run("sessions", "stop", home, thread.id);
  const result = await waiting;

  assert.equal(stopped.code, 0);
  assert.deepEqual(stopped.out, [`Stopped the work in the session for thread ${thread.id}.`]);
  assert.equal(result.code, 130);
  assert.deepEqual(result.out, []);
  assert.deepEqual(result.err, ["The input was cancelled before it was answered."]);
  // The agent is still there, and can be asked again.
  assert.equal((await run("sessions", "steer", home, thread.id, "hello", "--wait")).code, 0);
  const slow = tell("go slow, in the thread");
  await until(() => model.requests.length > 3, "the model to start on the thread's message");
  assert.equal((await run("sessions", "stop", home, thread.id)).code, 0);
  await eventually(
    () => chat.chat.messages().find((message) => message.id === slow.id)?.receipts[0]?.status,
    (status) => status === "stopped",
    { what: "the message to be marked stopped" },
  );
});

test("input the model refuses makes the waiting command exit 1, with the reason", { timeout }, async (t) => {
  const { home, thread, ask } = await servedHome(t);
  await ask("first");

  const result = await run("sessions", "steer", home, thread.id, "please refuse", "--wait");

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.equal(result.err.length, 1);
  assert.match(result.err[0] ?? "", /^The input ended without an answer \(model_error: .*The test model refuses this request\./);
});

test("a message the model refuses is marked failed, with the reason, and a person can read it in the thread", { timeout }, async (t) => {
  const { chat, thread, ask } = await servedHome(t);

  const said = await ask("please refuse");

  const receipt = chat.chat.messages(thread.id).find((message) => message.id === said.id)?.receipts[0];
  assert.equal(receipt?.status, "failed");
  assert.match(receipt.detail ?? "", /^The model failed: .*The test model refuses this request\./);
  assert.deepEqual(
    chat.chat.messages(thread.id).filter((message) => message.author.id === "agent:scout"),
    [],
  );
});

test("a second agent on a home is refused, and the first keeps serving", { timeout }, async (t) => {
  const { home } = await servedHome(t);

  const second = await run("agent", "serve", home);

  assert.equal(second.code, 1);
  assert.match(second.err.join("\n"), /Another process owns the agent home at /);
  assert.equal((await run("agent", "status", home)).code, 0);
});

test("a waiting command says so when the agent stops under it", { timeout }, async (t) => {
  const { home, model, thread, ask, stopNow } = await servedHome(t);
  await ask("first");
  const waiting = run("sessions", "steer", home, thread.id, "go slow", "--wait");
  await until(() => model.requests.length > 1, "the model to start answering");

  assert.equal(await stopNow(), 0);
  const result = await waiting;

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.deepEqual(result.err, [
    "Lost the connection to the agent. If it stopped, the work that was running resumes when it starts again.",
  ]);
});

test("--now stops the agent without waiting for the running turn", { timeout }, async (t) => {
  const { home, model, thread, ask, stop } = await servedHome(t, "--now");
  await ask("first");
  const waiting = run("sessions", "steer", home, thread.id, "go slow", "--wait");
  await until(() => model.requests.length > 1, "the model to start answering");

  // The test model streams for ten seconds, and a stop that waits would give the turn five of them.
  const started = Date.now();
  assert.equal(await stop(), 0);
  assert.ok(Date.now() - started < 3000, `stopping took ${Date.now() - started} ms`);
  assert.equal((await waiting).code, 1);
});
