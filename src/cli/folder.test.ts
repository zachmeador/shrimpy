import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { stopAfter, tempDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo, commandLines, shrimpy, useShrimpyDir } from "./testing/index.ts";

/*
 * Daily use needs no paths: an agent is a name, and its home is in the Shrimpy
 * folder. These run the commands in this process, against a folder of the
 * test's own, and start no program. Where the answer depends on the shell a
 * command runs in, it runs as a process of its own.
 */

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err.join("\n") };
}

const modelFlags = ["--model", "local/test-model"];

const agentFile = (home: string): unknown => JSON.parse(readFileSync(join(home, "agent.json"), "utf8"));

test("agent init with a name makes the home in the Shrimpy folder and names the agent for it, with a path it makes the home there, and it says what to type next; a folder name no agent can have needs --name", async (t) => {
  const folder = useShrimpyDir(t);
  assert.equal(existsSync(folder), false, "nothing is made until a command needs it");

  const made = await run("agent", "init", "scout", ...modelFlags);

  assert.equal(made.code, 0, made.err);
  const model = { provider: "local", id: "test-model" };
  assert.deepEqual(agentFile(join(folder, "agents", "scout")), { name: "scout", model });
  assert.deepEqual(commandLines(made.out.join("\n")), ["shrimpy up", "shrimpy agent serve scout"]);

  const elsewhere = join(tempDir(t, "elsewhere"), "maya");
  const path = await run("agent", "init", elsewhere, ...modelFlags);
  const renamed = await run("agent", "init", join(tempDir(t, "elsewhere"), "rex-home"), "--name", "rex", ...modelFlags);

  assert.equal(path.code, 0, path.err);
  assert.deepEqual(agentFile(elsewhere), { name: "maya", model });
  assert.deepEqual(commandLines(path.out.join("\n")), [`shrimpy up ${elsewhere}`, `shrimpy agent serve ${elsewhere}`]);
  assert.equal(renamed.code, 0, renamed.err);
  assert.equal(readdirSync(join(folder, "agents")).join(), "scout", "and nothing of those went into the folder");

  // The agent is named for its folder, so a folder name that no agent can have needs --name to give it one that differs.
  const odd = await run("agent", "init", "Scout Bot", ...modelFlags);
  const oddHome = join(folder, "agents", "Scout Bot");
  assert.equal(odd.code, 2);
  assert.match(odd.err, /--name/);
  assert.equal(existsSync(oddHome), false);
  assert.equal((await run("agent", "init", "Scout Bot", "--name", "scout-bot", ...modelFlags)).code, 0);
  assert.deepEqual(agentFile(oddHome), { name: "scout-bot", model });
});

test("a folder with someone else's files in it is not used, and nothing is made in it, until the files are gone; dot files are not someone else's", async (t) => {
  const folder = useShrimpyDir(t);
  mkdirSync(folder);
  writeFileSync(join(folder, "package.json"), "{}");

  // `up` would run until stopped if it had started anything.
  for (const args of [["agent", "init", "scout", ...modelFlags], ["up"], ["up", "scout"], ["agent", "context", "--agent", "scout"]]) {
    const refused = await run(...args);
    assert.equal(refused.code, 1, args.join(" "));
    assert.match(refused.err, /SHRIMPY_DIR/);
  }

  assert.deepEqual(readdirSync(folder), ["package.json"]);
  // An empty folder is Shrimpy's, and so is one with only dot files in it, such as the .DS_Store Finder leaves.
  rmSync(join(folder, "package.json"));
  for (const left of [[], [".DS_Store"]]) {
    for (const file of left) writeFileSync(join(folder, file), "");
    const used = await run("up");
    assert.doesNotMatch(used.err, /SHRIMPY_DIR/, `a folder holding ${JSON.stringify(left)}`);
  }
  assert.equal((await run("agent", "init", "scout", ...modelFlags)).code, 0);
});

test("a name with no home behind it says so, lists the agents the folder has, and says how to make one; up with none says the same", async (t) => {
  const folder = useShrimpyDir(t);

  const none = await run("up");

  assert.equal(none.code, 1);
  assert.match(none.err, /shrimpy agent init <name> --model <provider\/id>/);
  assert.equal(existsSync(folder), false, "and it made nothing");

  for (const name of ["scout", "rex"]) await run("agent", "init", name, ...modelFlags);
  mkdirSync(join(folder, "agents", "notes"));
  for (const args of [["agent", "status", "--agent", "maya"], ["sessions", "list", "--agent", "maya"], ["up", "maya"]]) {
    const missing = await run(...args);
    assert.equal(missing.code, 1, args.join(" "));
    assert.match(missing.err, /no agent called maya/);
    assert.match(missing.err, /rex, scout\./, "the agents it has, and only those");
    assert.match(missing.err, /shrimpy agent init maya --model <provider\/id>/);
  }

  // A home in the current directory takes ./ to reach, and the message says so.
  const here = tempDir(t, "here");
  mkdirSync(join(here, "maya"));
  writeFileSync(join(here, "maya", "agent.json"), "{}");
  const before = process.cwd();
  process.chdir(here);
  stopAfter(t, () => process.chdir(before));
  assert.match((await run("agent", "status", "--agent", "maya")).err, /write \.\/maya/);
});

test("in a person's terminal a command about one agent acts on the only agent the folder has, and with two it lists them and asks for --agent; in an agent's shell it acts on that agent whatever the folder has", { timeout: 30_000 }, async (t) => {
  const folder = useShrimpyDir(t);
  const homeOf = (name: string): string => join(folder, "agents", name);
  // The launcher in an agent's home sets this for its shell, so each command here says which shell it runs in.
  const person = { env: { [AGENT_HOME_VARIABLE]: "" } };
  assert.equal((await run("agent", "init", "scout", ...modelFlags)).code, 0);

  // agent context reads the home's files and starts nothing, and says whose files they are.
  const only = await shrimpy(["agent", "context"], person);
  assert.equal(only.code, 0, only.stderr);
  assert.ok(only.stdout.includes(homeOf("scout")), only.stdout);

  assert.equal((await run("agent", "init", "rex", ...modelFlags)).code, 0);
  const two = await shrimpy(["agent", "context"], person);
  assert.equal(two.code, 2);
  assert.ok(two.stderr.includes("--agent") && two.stderr.includes("rex, scout"), `it asks for the flag and lists the agents:\n${two.stderr}`);
  const named = await shrimpy(["agent", "context", "--agent", "rex"], person);
  assert.equal(named.code, 0, named.stderr);
  assert.ok(named.stdout.includes(homeOf("rex")), named.stdout);

  const inShell = await shrimpy(["agent", "context"], { env: { [AGENT_HOME_VARIABLE]: homeOf("scout") } });
  assert.equal(inShell.code, 0, inShell.stderr);
  assert.ok(inShell.stdout.includes(homeOf("scout")), inShell.stdout);
});
