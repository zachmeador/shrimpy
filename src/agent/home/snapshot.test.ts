import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { INCLUDED_SKILLS } from "./included.ts";
import { type HomePaths, homePaths } from "./layout.ts";
import { type HomeSnapshot, readHomeSnapshot } from "./snapshot.ts";

/** What the home's own files give, without the skills that ship with Shrimpy, which most of these tests are not about. */
async function readHome(paths: HomePaths): Promise<HomeSnapshot> {
  const snapshot = await readHomeSnapshot(paths);
  return {
    ...snapshot,
    skills: snapshot.skills.filter((skill) => skill.file.startsWith(paths.root)),
    leftOut: snapshot.leftOut.filter((each) => !isAbsolute(each.file)),
  };
}

function newHome(t: TestContext) {
  const paths = homePaths(join(tempDir(t, "snapshot"), "scout"));
  mkdirSync(paths.root, { recursive: true });
  /** Write a file inside the home, making its folders. */
  const write = (relativePath: string, text: string): string => {
    const path = join(paths.root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return path;
  };
  return { paths, write };
}

const skill = (description: string, name?: string): string =>
  ["---", ...(name === undefined ? [] : [`name: ${name}`]), `description: ${description}`, "---", "# Steps", ""].join("\n");

test("SOUL.md, the Markdown files of context/ and the skills are read, each in a fixed order, and nothing else is", async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md", "You are scout.\n");
  write("context/user.md", "Zach likes short answers.\n");
  write("context/projects/shrimpy.md", "Shrimpy is a home agent.\n");
  write("context/Alpha.MD", "Upper-case extension.\n");
  write("context/data.json", "{}");
  write("context/.hidden.md", "secret");
  write("skills/review/SKILL.md", skill("Review a diff for bugs."));
  write("skills/deploy/SKILL.md", skill("Ship a build.", "ship-it"));

  const snapshot = await readHome(paths);

  assert.equal(snapshot.soul, "You are scout.\n");
  assert.deepEqual(snapshot.files, [
    { path: "context/Alpha.MD", text: "Upper-case extension.\n" },
    { path: "context/projects/shrimpy.md", text: "Shrimpy is a home agent.\n" },
    { path: "context/user.md", text: "Zach likes short answers.\n" },
  ]);
  assert.deepEqual(snapshot.skills, [
    { name: "review", description: "Review a diff for bugs.", file: join(paths.skills, "review", "SKILL.md") },
    { name: "ship-it", description: "Ship a build.", file: join(paths.skills, "deploy", "SKILL.md") },
  ]);
  assert.deepEqual(snapshot.leftOut, []);
});

test("a file that cannot be read is left out and named, and the others are still read", { skip: process.getuid?.() === 0 }, async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/good.md", "Fine.\n");
  const locked = write("context/locked.md", "Hidden from the agent.\n");
  chmodSync(locked, 0o000);
  t.after(() => rmSync(locked, { force: true }));

  const snapshot = await readHome(paths);

  assert.equal(snapshot.soul, "Be brief.\n");
  assert.deepEqual(snapshot.files.map((file) => file.path), ["context/good.md"]);
  assert.deepEqual(snapshot.leftOut.map((each) => each.file), ["context/locked.md"]);
});

test("links to files and folders are followed, a link back on itself ends, and a broken one is named", async (t) => {
  const { paths, write } = newHome(t);
  const shared = write("shared/team.md", "Team notes.\n");
  write("shared/more/extra.md", "Extra.\n");
  write("elsewhere/shared-skill/SKILL.md", skill("Shared between homes."));
  mkdirSync(paths.context, { recursive: true });
  mkdirSync(paths.skills, { recursive: true });
  symlinkSync(shared, join(paths.context, "team.md"));
  symlinkSync(join(paths.root, "shared", "more"), join(paths.context, "more"));
  symlinkSync(paths.context, join(paths.context, "again"));
  symlinkSync(join(paths.root, "nowhere.md"), join(paths.context, "gone.md"));
  symlinkSync(join(paths.root, "elsewhere", "shared-skill"), join(paths.skills, "shared-skill"));

  const snapshot = await readHome(paths);

  assert.deepEqual(snapshot.files.map((file) => file.path), ["context/more/extra.md", "context/team.md"]);
  assert.deepEqual(snapshot.skills.map((each) => each.name), ["shared-skill"]);
  assert.deepEqual(snapshot.leftOut.map((each) => each.file), ["context/gone.md"]);
});

test("a skill with no description, or no front matter, is left out and named; a folder that is not a skill is not", async (t) => {
  const { paths, write } = newHome(t);
  write("skills/ok/SKILL.md", skill("Works."));
  write("skills/no-description/SKILL.md", "---\nname: no-description\n---\nbody\n");
  write("skills/no-front-matter/SKILL.md", "# Just a title\n");
  write("skills/assets/diagram.png", "not a skill");

  const snapshot = await readHome(paths);

  assert.deepEqual(snapshot.skills.map((each) => each.name), ["ok"]);
  assert.deepEqual(
    snapshot.leftOut.map((each) => each.file),
    ["skills/no-description/SKILL.md", "skills/no-front-matter/SKILL.md"],
  );
});

test("every home is shown the skills that ship with Shrimpy, and a skill of the home with the same name replaces one", async (t) => {
  const { paths, write } = newHome(t);
  const shipped = readdirSync(INCLUDED_SKILLS).sort();
  assert.notEqual(shipped.length, 0, "Shrimpy ships skills, and they are found from the code's own location");

  const before = await readHomeSnapshot(paths);
  assert.deepEqual(before.skills.map((each) => each.name), shipped);
  assert.deepEqual(before.leftOut, [], "every skill that ships is written right");

  const [replaced = ""] = shipped;
  write(`skills/${replaced}/SKILL.md`, skill("Mine."));
  const after = await readHomeSnapshot(paths);
  assert.deepEqual(after.skills.map((each) => each.name), shipped, "the same skills are shown");
  const mine = after.skills.find((each) => each.name === replaced);
  assert.deepEqual([mine?.description, mine?.file], ["Mine.", join(paths.skills, replaced, "SKILL.md")]);
  assert.equal(after.skills.filter((each) => each.file.startsWith(paths.root)).length, 1, "and no other is replaced");
});
