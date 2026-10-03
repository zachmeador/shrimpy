import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out.join("\n"), err: cli.err.join("\n") };
}

function tempHome(): string {
  return join(mkdtempSync(join(tmpdir(), "shrimpy-cli-")), "scout");
}

test("with no command it prints the commands and exits with 2", async () => {
  const result = await run();
  assert.equal(result.code, 2);
  assert.match(result.err, /^Usage: shrimpy <command> \[arguments\]\n\nCommands:\n {2}agent init <home> --name <name> --model <provider\/id>\n/);
  for (const command of ["agent serve", "agent status", "sessions list", "sessions read", "sessions steer", "sessions stop"]) {
    assert.ok(result.err.includes(`  ${command} `), command);
  }
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
    /^Usage: shrimpy sessions steer <home> <text> \[--request-id <id>\] \[--wait\]\n\nGive the main session input; it joins work already running\.\nWith --wait, print the answer and exit 0 /,
  );
  assert.match(result.out, /130 when it was cancelled\./);
});

test("a command used wrongly exits with 2 and shows its usage", async () => {
  const cases: [string[], string][] = [
    [["agent", "init"], "Missing <home>."],
    [["agent", "init", "h", "--model", "a/b"], "Missing --name."],
    [["agent", "init", "h", "--name", "a"], "Missing --model."],
    [["agent", "init", "h", "--name", "a", "--model", "nope"], 'Model "nope" should be provider/id'],
    [["agent", "init", "a", "b", "--name", "a", "--model", "x/y"], "Unexpected argument: b."],
    [["agent", "serve", "h", "--fast"], "Unknown option '--fast'"],
    [["sessions", "steer", "h"], "Missing <text>."],
    [["sessions", "steer", "h", "one", "two"], "Unexpected argument: two. Put text with spaces in quotes."],
    [["sessions", "steer", "h", "   "], "The text is empty."],
    [["sessions", "read", "h", "--json=yes"], "does not take an argument"],
  ];
  for (const [args, expected] of cases) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.ok(result.err.includes(expected), `${args.join(" ")} -> ${result.err}`);
    assert.match(result.err, /\nUsage: shrimpy [a-z]+ [a-z]+ /);
  }
});

test("init creates a home and says what to do next, and running it again changes nothing", async () => {
  const home = tempHome();

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

test("init refuses to change an agent, and refuses a name that cannot be used", async () => {
  const home = tempHome();
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  const renamed = await run("agent", "init", home, "--name", "other", "--model", "local/qwen");
  assert.equal(renamed.code, 1);
  assert.match(renamed.err, /already describes the agent "scout" with the model local\/qwen\. Init does not change an existing agent/);

  const odd = tempHome();
  const bad = await run("agent", "init", odd, "--name", "has space", "--model", "local/qwen");
  assert.equal(bad.code, 1);
  assert.match(bad.err, /^The agent name "has space" must start with a letter or digit/);
  assert.equal(existsSync(odd), false);
});

test("status says no agent is running, and exits with 1", async () => {
  const home = tempHome();
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  const result = await run("agent", "status", home);

  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.out), { running: false, home });
});

test("session commands say how to start the agent when none is running", async () => {
  const home = tempHome();
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");

  for (const args of [["list"], ["read"], ["steer", "hello"], ["stop"]]) {
    const result = await run("sessions", args[0] ?? "", home, ...args.slice(1));
    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.err, `No agent is running at ${home}. Start one with: shrimpy agent serve ${home}`);
  }
});

test("serve refuses a folder that is not a home, and a model it cannot use, and says why", async () => {
  const folder = mkdtempSync(join(tmpdir(), "shrimpy-cli-"));
  const notHome = await run("agent", "serve", folder);
  assert.equal(notHome.code, 1);
  assert.match(notHome.err, /is not an agent home/);

  const home = tempHome();
  await run("agent", "init", home, "--name", "scout", "--model", "local/qwen");
  const noProvider = await run("agent", "serve", home);
  assert.equal(noProvider.code, 1);
  assert.match(noProvider.err, /names the provider "local", which is not declared in /);
  assert.equal(existsSync(join(home, "runtime", "owner.lock")), false);
});
