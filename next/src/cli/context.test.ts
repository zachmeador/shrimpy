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

test("agent context previews the sections the agent would be told, in order, and says it is a preview", async (t) => {
  const paths = await newHome(t);
  writeFileSync(paths.soul, "You are scout, who keeps the build green.\n");
  writeFileSync(join(paths.context, "user.md"), "Zach likes short answers.\n");
  mkdirSync(join(paths.skills, "review"));
  writeFileSync(join(paths.skills, "review", "SKILL.md"), "---\ndescription: Review a diff for bugs.\n---\n");

  const { code, out, err } = await run("agent", "context", paths.root);

  assert.equal(code, 0, err.join("\n"));
  assert.deepEqual(err, []);
  const [label, ...rest] = out;
  assert.equal(
    label,
    `Preview of what the agent would be told if it started now, from the files of ${paths.root}. ` +
      "A running agent has what it read when it started or last reloaded.\n",
  );
  const sections = rest.join("\n");
  assert.match(sections, /^<shrimpy>\nYou are scout, an agent in Shrimpy\./);
  // The instructions themselves mention <skills>, so look for each tag on a line of its own.
  const order = ["shrimpy", "soul", "context", "skills"].map((tag) => `\n${sections}`.indexOf(`\n<${tag}>\n`));
  assert.deepEqual(order, order.toSorted((a, b) => a - b), "in the order the model reads them");
  assert.ok(order.every((at) => at >= 0));
  assert.match(sections, /<soul>\nYou are scout, who keeps the build green\.\n<\/soul>/);
  assert.match(sections, /<file path="context\/user\.md">\nZach likes short answers\.\n<\/file>/);
  assert.ok(sections.includes(`- review: Review a diff for bugs.\n  ${join(paths.skills, "review", "SKILL.md")}\n</skills>`));
  assert.doesNotMatch(sections, /Left out/);
});

test("agent context names the files that would be left out, after the sections", async (t) => {
  const paths = await newHome(t);
  mkdirSync(join(paths.skills, "broken"));
  writeFileSync(join(paths.skills, "broken", "SKILL.md"), "# no front matter\n");

  const { code, out } = await run("agent", "context", paths.root);

  assert.equal(code, 0);
  assert.equal(
    out.at(-1),
    "\nLeft out:\n  skills/broken/SKILL.md: it does not start with a front matter block, between --- lines",
  );
});

test("agent context starts nothing and claims nothing: the home's lock and storage are never made", async (t) => {
  const paths = await newHome(t);

  await run("agent", "context", paths.root);
  await run("agent", "context", paths.root);

  assert.equal(existsSync(paths.database), false);
  assert.equal(existsSync(join(paths.runtime, "owner.lock")), false);
});

test("agent context for a folder that is not a home says how to make one", async (t) => {
  const folder = tempDir(t, "not-a-home");

  const { code, err } = await run("agent", "context", folder);

  assert.equal(code, 1);
  assert.match(err.join("\n"), /is not an agent home/);
});

test("agent context needs a home", async () => {
  const { code, err } = await run("agent", "context");

  assert.equal(code, 2);
  assert.equal(err[0], "Missing <home>.");
});
