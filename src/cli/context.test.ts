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
    runtime: join(home, "runtime"),
    database: join(home, "state", "agent.sqlite"),
  };
}

test("agent context previews the sections the agent would be told, in order, and labels them as a preview", async (t) => {
  const paths = await newHome(t);
  writeFileSync(paths.soul, "You are scout, who keeps the build green.\n");
  writeFileSync(join(paths.context, "user.md"), "Zach likes short answers.\n");
  mkdirSync(join(paths.skills, "review"));
  writeFileSync(join(paths.skills, "review", "SKILL.md"), "---\ndescription: Review a diff for bugs.\n---\n");

  const { code, out, err } = await run("agent", "context", "--agent", paths.root);

  assert.equal(code, 0, err.join("\n"));
  const [label, ...rest] = out;
  assert.match(label ?? "", /preview/i);
  const sections = rest.join("\n");
  // The instructions themselves mention <skills>, so look for each tag on a line of its own.
  const order = ["shrimpy", "soul", "context", "skills"].map((tag) => `\n${sections}`.indexOf(`\n<${tag}>\n`));
  assert.deepEqual(order, order.toSorted((a, b) => a - b), "in the order the model reads them");
  assert.ok(order.every((at) => at >= 0));
  assert.ok(sections.includes("You are scout, who keeps the build green."));
  assert.ok(sections.includes("Zach likes short answers."));
  assert.ok(sections.includes("Review a diff for bugs."));
});

test("agent context starts nothing and claims nothing: the home's lock and storage are never made", async (t) => {
  const paths = await newHome(t);

  await run("agent", "context", "--agent", paths.root);
  await run("agent", "context", "--agent", paths.root);

  assert.equal(existsSync(paths.database), false);
  assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
});
