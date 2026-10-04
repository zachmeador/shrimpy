import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { PromptInput } from "@earendil-works/pi-durable";
import { tempDir } from "../../../lib/testing/index.ts";
import { homePaths } from "../../home/index.ts";
import { type HomeContext, homeContext, previewContext } from "./home-context.ts";

function newHome(t: TestContext) {
  const paths = homePaths(join(tempDir(t, "context"), "scout"));
  mkdirSync(paths.root, { recursive: true });
  const write = (relativePath: string, text: string): void => {
    const path = join(paths.root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  return { paths, write, agent: { name: "scout", home: paths.root } };
}

/** What each section of the extension renders now. Rendering takes nothing from the request. */
async function rendered(context: HomeContext): Promise<Record<string, string | undefined>> {
  const texts: Record<string, string | undefined> = {};
  for (const each of context.extension.sections ?? []) {
    texts[each.key] = await each.render({} as PromptInput, BACKGROUND_CONTEXT);
  }
  return texts;
}

const skill = (description: string): string => `---\ndescription: ${description}\n---\nSteps.\n`;

test("the extension has the four sections, in order, and the engine adds no tags of its own", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");

  const context = await homeContext(agent);

  assert.equal(context.extension.name, "home-context");
  assert.deepEqual(context.extension.sections?.map((each) => [each.key, each.tag]), [
    ["shrimpy", false],
    ["soul", false],
    ["context", false],
    ["skills", false],
  ]);
  const texts = await rendered(context);
  assert.match(texts.shrimpy ?? "", /^<shrimpy>\nYou are scout, an agent in Shrimpy\./);
  assert.equal(texts.soul, "<soul>\nBe brief.\n</soul>");
  assert.equal(texts.context, undefined);
});

test("rendering reads no file: the text is what the files said when they were read, even once they are gone", async (t) => {
  const { paths, write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/user.md", "Zach likes short answers.\n");
  write("skills/review/SKILL.md", skill("Review a diff."));
  const context = await homeContext(agent);
  const before = await rendered(context);

  rmSync(paths.soul);
  rmSync(paths.context, { recursive: true });
  rmSync(paths.skills, { recursive: true });

  assert.deepEqual(await rendered(context), before);
  assert.match(before.soul ?? "", /Be brief\./);
  assert.match(before.context ?? "", /Zach likes short answers\./);
  assert.match(before.skills ?? "", /review: Review a diff\./);
});

test("editing a file changes nothing until the home is reloaded, and then the later requests follow it", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  const context = await homeContext(agent);

  write("SOUL.md", "Answer in rhyme.\n");
  write("context/new.md", "A new note.\n");
  assert.match((await rendered(context)).soul ?? "", /Be brief\./);
  assert.equal((await rendered(context)).context, undefined);

  const report = await context.reload();

  assert.match((await rendered(context)).soul ?? "", /Answer in rhyme\./);
  assert.match((await rendered(context)).context ?? "", /A new note\./);
  assert.equal(report.soul, true);
  assert.equal(report.files, 1);
  assert.deepEqual(report.leftOut, []);
});

test("the first reading is reported with what it found, and a reload with what it finds", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/a.md", "A.\n");
  write("context/b.md", "B.\n");
  write("skills/ok/SKILL.md", skill("Works."));
  write("skills/bad/SKILL.md", "no front matter\n");

  const context = await homeContext(agent);

  assert.equal(context.report.soul, true);
  assert.equal(context.report.files, 2);
  assert.deepEqual(context.report.leftOut, [
    { file: "skills/bad/SKILL.md", reason: "it does not start with a front matter block, between --- lines" },
  ]);

  write("skills/bad/SKILL.md", skill("Fixed."));
  const reloaded = await context.reload();
  assert.deepEqual(reloaded.leftOut, []);
  assert.equal(reloaded.skills, context.report.skills + 1, "the skill that was left out is now counted");
  assert.equal(context.report.leftOut.length, 1, "the first report stays as it was");
});

test("a file taken away is dropped from the sections by a reload", async (t) => {
  const { paths, write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/user.md", "Notes.\n");
  const context = await homeContext(agent);

  rmSync(paths.soul);
  rmSync(join(paths.context, "user.md"));
  await context.reload();

  const texts = await rendered(context);
  assert.equal(texts.soul, undefined);
  assert.equal(texts.context, undefined);
  assert.ok(texts.shrimpy);
});

test("reloads that overlap are read one after another, and the last one decides", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "one\n");
  const context = await homeContext(agent);

  const first = context.reload();
  write("SOUL.md", "two\n");
  const second = context.reload();
  write("SOUL.md", "three\n");
  const third = context.reload();
  await Promise.all([first, second, third]);

  assert.match((await rendered(context)).soul ?? "", /three/);
});

test("the preview is the sections the model gets, read from the files as they are now", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/user.md", "Notes.\n");
  write("skills/ok/SKILL.md", skill("Works."));
  write("skills/bad/SKILL.md", "no front matter\n");
  const context = await homeContext(agent);
  write("SOUL.md", "Answer in rhyme.\n");

  const preview = await previewContext(agent);

  const asRendered = await rendered(context);
  assert.equal(preview.sections.find((each) => each.key === "context")?.text, asRendered.context);
  assert.equal(preview.sections.find((each) => each.key === "skills")?.text, asRendered.skills);
  assert.match(preview.sections.find((each) => each.key === "soul")?.text ?? "", /Answer in rhyme\./);
  assert.match(asRendered.soul ?? "", /Be brief\./, "the running extension keeps what it read");
  assert.deepEqual(preview.leftOut.map((each) => each.file), ["skills/bad/SKILL.md"]);
});

test("the home may be given as a relative path, and the instructions name its absolute path", async (t) => {
  const { paths } = newHome(t);

  const preview = await previewContext({ name: "scout", home: relative(process.cwd(), paths.root) });

  assert.ok(preview.sections[0]?.text.includes(`Your home is ${paths.root}, and your tools run from there.`));
});
