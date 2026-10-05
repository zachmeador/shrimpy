import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stopAfter, tempDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo, commandLines, useShrimpyDir } from "./testing/index.ts";

/*
 * Daily use needs no paths: an agent is a name, and its home is in the Shrimpy
 * folder. These run the commands in this process, against a folder of the
 * test's own, and start no program.
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
  for (const args of [["agent", "init", "scout", ...modelFlags], ["up"], ["up", "scout"], ["agent", "context", "scout"]]) {
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
  for (const args of [["agent", "status", "maya"], ["sessions", "list", "maya"], ["up", "maya"]]) {
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
  assert.match((await run("agent", "status", "maya")).err, /write \.\/maya/);
});
