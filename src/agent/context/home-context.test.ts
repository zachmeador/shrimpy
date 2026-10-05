import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { PromptInput } from "@earendil-works/pi-durable";
import { tempDir } from "../../lib/testing/index.ts";
import { homePaths } from "../home/index.ts";
import { homeContext, type HomeContext } from "./home-context.durable.ts";
import { previewContext } from "./preview.ts";

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

test("the preview is read from the files as they are now, while the running extension keeps what it read", async (t) => {
  const { write, agent } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/user.md", "Notes.\n");
  const context = await homeContext(agent);
  write("SOUL.md", "Answer in rhyme.\n");

  const preview = await previewContext(agent);

  assert.match(preview.sections.find((each) => each.key === "soul")?.text ?? "", /Answer in rhyme\./);
  assert.match((await rendered(context)).soul ?? "", /Be brief\./, "the running extension keeps what it read");
});
