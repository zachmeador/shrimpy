import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out.join("\n"), err: cli.err.join("\n") };
}

function tempHome(t: TestContext): string {
  return join(tempDir(t, "cli"), "scout");
}

test("with no command it prints the commands and exits with 2", async () => {
  const result = await run();
  assert.equal(result.code, 2);
  assert.match(result.err, /^Usage: shrimpy <command> \[arguments\]\n\nCommands:\n {2}run <agent> "<text>" \[--thread <id>\] \[--no-wait\]\n/);
  for (const command of [
    "run",
    "threads",
    "read",
    "agent init",
    "agent serve",
    "agent status",
    "sessions list",
    "sessions read",
    "sessions steer",
    "sessions stop",
    "gateway serve",
    "chat serve",
  ]) {
    assert.ok(result.err.includes(`  ${command} `), command);
  }
  // A command with no arguments is listed as its name alone.
  assert.ok(result.err.includes("\n  gateway status\n      List the programs registered"));
});

test("help lists the commands on standard output and exits with 0", async () => {
  for (const word of ["help", "--help", "-h"]) {
    const result = await run(word);
    assert.equal(result.code, 0, word);
    assert.match(result.out, /^Usage: shrimpy <command>/);
    assert.equal(result.err, "");
  }
});

test("an unknown command is refused with the list of commands", async () => {
  for (const args of [["nope"], ["agent", "nope"], ["sessions"], ["agent", "--wait"]]) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.err, /^Unknown command: /);
    assert.match(result.err, /Commands:/);
  }
  assert.match((await run("agent", "nope")).err, /^Unknown command: agent nope\n/);
  // Properties of plain objects are not commands.
  assert.equal((await run("constructor")).code, 2);
});

test("a command's help names its usage and what it does", async () => {
  const result = await run("sessions", "steer", "--help");
  assert.equal(result.code, 0);
  assert.match(
    result.out,
    /^Usage: shrimpy sessions steer <home> <thread> <text> \[--request-id <id>\] \[--wait\]\n\nGive the session behind a thread input; it joins work already running\.\nDirect input is a control, like stopping, and not a message: /,
  );
  assert.match(result.out, /With --wait, print the answer and exit 0 /);
  assert.match(result.out, /130 when it was cancelled\./);
});

test("a command of one word is selected by it, and its help names its usage", async () => {
  const result = await run("run", "--help");

  assert.equal(result.code, 0);
  assert.match(
    result.out,
    /^Usage: shrimpy run <agent> "<text>" \[--thread <id>\] \[--no-wait\]\n\nSay something to an agent and print its reply\.\nPosts the text in your DM with the agent/,
  );
});

test("a command that takes no arguments has a usage line that ends with its name", async () => {
  const result = await run("gateway", "status", "--help");
  assert.equal(result.code, 0);
  assert.match(result.out, /^Usage: shrimpy gateway status\n\nList the programs registered with this machine's gateway/);
});

test("a command used wrongly exits with 2 and shows its usage", async () => {
  const cases: [string[], string][] = [
    [["agent", "init"], "Missing <home>."],
    [["agent", "init", "h", "--model", "a/b"], "Missing --name."],
    [["agent", "init", "h", "--name", "a"], "Missing --model."],
    [["agent", "init", "h", "--name", "a", "--model", "nope"], 'Model "nope" should be provider/id'],
    [["agent", "init", "a", "b", "--name", "a", "--model", "x/y"], "Unexpected argument: b."],
    [["agent", "serve", "h", "--fast"], "Unknown option '--fast'"],
    [["sessions", "steer", "h"], "Missing <thread>."],
    [["sessions", "steer", "h", "th_1"], "Missing <text>."],
    [["sessions", "steer", "h", "th_1", "one", "two"], "Unexpected argument: two. Put text with spaces in quotes."],
    [["sessions", "steer", "h", "th_1", "   "], "The text is empty."],
    [["sessions", "read", "h"], "Missing <thread>."],
    [["sessions", "read", "h", "th_1", "--json=yes"], "does not take an argument"],
    [["sessions", "stop", "h"], "Missing <thread>."],
    [["gateway", "serve", "--web-dir", "site"], "--web-dir needs --web-port."],
    [["gateway", "serve", "--web-port", "http"], '--web-port must be a port number from 0 to 65535, not "http".'],
    [["gateway", "serve", "--web-port", "65536"], '--web-port must be a port number from 0 to 65535, not "65536".'],
    [["gateway", "serve", "--web-port=-1"], '--web-port must be a port number from 0 to 65535, not "-1".'],
    [["gateway", "serve", "--web-port"], "argument missing"],
    [["gateway", "serve", "now"], "Unexpected argument: now."],
    [["gateway", "status", "now"], "Unexpected argument: now."],
    [["chat", "serve"], "Missing <data-dir>."],
    [["chat", "serve", "a", "b"], "Unexpected argument: b."],
    [["run"], "Missing <agent>."],
    [["run", "scout"], "Missing <text>."],
    [["run", "scout", "hello", "there"], "Unexpected argument: there. Put text with spaces in quotes."],
    [["run", "scout", "   "], "The text is empty."],
    [["run", "scout", "hello", "--thread"], "argument missing"],
    [["run", "scout", "hello", "--wait"], "Unknown option '--wait'"],
    [["threads"], "Missing <agent>."],
    [["threads", "scout", "rex"], "Unexpected argument: rex."],
    [["read"], "Missing <thread>."],
    [["read", "th_a", "th_b"], "Unexpected argument: th_b."],
  ];
  for (const [args, expected] of cases) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.ok(result.err.includes(expected), `${args.join(" ")} -> ${result.err}`);
    assert.match(result.err, /\nUsage: shrimpy [a-z]+/);
  }
});

test("init creates a home and says what to do next, and running it again changes nothing", async (t) => {
  const home = tempHome(t);

  const first = await run("agent", "init", home, "--name", "scout", "--model", "local/qwen3.8-27b");
  assert.equal(first.code, 0);
  assert.equal(first.err, "");
  assert.ok(first.out.includes(`Created the agent scout in ${home}, with the model local/qwen3.8-27b.`));
  assert.ok(first.out.includes(join(home, "state", "pi", "models.json")));
  assert.ok(first.out.includes(`shrimpy agent serve ${home}`));
  assert.deepEqual(JSON.parse(readFileSync(join(home, "agent.json"), "utf8")), {
    name: "scout",
    model: { provider: "local", id: "qwen3.8-27b" },
  });

  const again = await run("agent", "init", home, "--name", "scout", "--model", "local/qwen3.8-27b");
  assert.equal(again.code, 0);
  assert.equal(again.out, `The agent scout is already set up in ${home}. Nothing was changed.`);
});

test("init refuses to change an agent, and refuses a name that cannot be used", async (t) => {
  const home = tempHome(t);
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  const renamed = await run("agent", "init", home, "--name", "other", "--model", "local/qwen");
  assert.equal(renamed.code, 1);
  assert.match(renamed.err, /already describes the agent "scout" with the model local\/qwen\. Init does not change an existing agent/);

  const odd = tempHome(t);
  const bad = await run("agent", "init", odd, "--name", "has space", "--model", "local/qwen");
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^The agent name "has space" must start with a letter or digit/);
  assert.equal(existsSync(odd), false);
});

test("status says no agent is running, and exits with 1", async (t) => {
  const home = tempHome(t);
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  const result = await run("agent", "status", home);

  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.out), { running: false, home });
});

test("session commands say how to start the agent when none is running", async (t) => {
  const home = tempHome(t);
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  for (const args of [["list"], ["read", "th_1"], ["steer", "th_1", "hello"], ["stop", "th_1"]]) {
    const result = await run("sessions", args[0] ?? "", home, ...args.slice(1));
    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.err, `No agent is running at ${home}. Start one with: shrimpy agent serve ${home}`);
  }
});

test("serve refuses a folder that is not a home, and a model it cannot use, and says why", async (t) => {
  const folder = tempDir(t, "cli");
  const notHome = await run("agent", "serve", folder);
  assert.equal(notHome.code, 1);
  assert.match(notHome.err, /is not an agent home/);

  const home = tempHome(t);
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");
  const noProvider = await run("agent", "serve", home);
  assert.equal(noProvider.code, 1);
  assert.match(noProvider.err, /names the provider "local", which is not declared in /);
  assert.equal(existsSync(join(home, "runtime", "owner.lock")), false);
});
