import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err };
}

async function newHome(t: TestContext) {
  const home = join(tempDir(t, "context"), "scout");
  assert.equal((await run("agent", "init", home, "--name", "scout", "--model", "local/test-model")).code, 0);
  return {
    root: home,
    soul: join(home, "SOUL.md"),
    context: join(home, "context"),
    skills: join(home, "skills"),
    runtime: join(home, "state", "runtime"),
    database: join(home, "state", "agent.sqlite"),
  };
}

test("agent context prints what the agent would be told, from its home's files", async (t) => {
  const paths = await newHome(t);
  writeFileSync(paths.soul, "You are scout, who keeps the build green.\n");
  writeFileSync(join(paths.context, "user.md"), "Zach likes short answers.\n");
  mkdirSync(join(paths.skills, "review"));
  writeFileSync(join(paths.skills, "review", "SKILL.md"), "---\ndescription: Review a diff for bugs.\n---\n");

  const { code, out, err } = await run("agent", "context", "--agent", paths.root);

  assert.equal(code, 0, err.join("\n"));
  const sections = out.join("\n");
  assert.ok(sections.includes("You are scout, who keeps the build green."));
  assert.ok(sections.includes("Zach likes short answers."));
  assert.ok(sections.includes("Review a diff for bugs."));
});

test("agent context starts nothing, and never makes the home's lock or storage", async (t) => {
  const paths = await newHome(t);

  await run("agent", "context", "--agent", paths.root);
  await run("agent", "context", "--agent", paths.root);

  assert.equal(existsSync(paths.database), false);
  assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
});
