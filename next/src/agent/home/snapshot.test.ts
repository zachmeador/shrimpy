import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { homePaths } from "./layout.ts";
import { readHomeSnapshot } from "./snapshot.ts";

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

test("a home with none of the files gives an empty snapshot, and nothing is wrong", async (t) => {
  const { paths } = newHome(t);

  assert.deepEqual(await readHomeSnapshot(paths), { soul: undefined, files: [], skills: [], leftOut: [] });
});

test("SOUL.md, the Markdown files of context/ and the skills are read, each in a fixed order", async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md", "You are scout.\n");
  write("context/user.md", "Zach likes short answers.\n");
  write("context/projects/shrimpy.md", "Shrimpy is a home agent.\n");
  write("context/Alpha.MD", "Upper-case extension.\n");
  write("skills/review/SKILL.md", skill("Review a diff for bugs."));
  write("skills/deploy/SKILL.md", skill("Ship a build.", "ship-it"));

  const snapshot = await readHomeSnapshot(paths);

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

test("only Markdown is read from context/, and hidden files and blank files are passed over without a word", async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md", "  \n");
  write("context/notes.md", "A note.\n");
  write("context/data.json", "{}");
  write("context/readme.txt", "plain");
  write("context/.hidden.md", "secret");
  write("context/.git/notes.md", "secret");
  write("context/empty.md", "\n \n");

  const snapshot = await readHomeSnapshot(paths);

  assert.equal(snapshot.soul, undefined);
  assert.deepEqual(snapshot.files.map((file) => file.path), ["context/notes.md"]);
  assert.deepEqual(snapshot.leftOut, []);
});

test("a file that cannot be read is left out and named, and the others are still read", { skip: process.getuid?.() === 0 }, async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md", "Be brief.\n");
  write("context/good.md", "Fine.\n");
  const locked = write("context/locked.md", "Hidden from the agent.\n");
  chmodSync(locked, 0o000);
  t.after(() => rmSync(locked, { force: true }));

  const snapshot = await readHomeSnapshot(paths);

  assert.equal(snapshot.soul, "Be brief.\n");
  assert.deepEqual(snapshot.files.map((file) => file.path), ["context/good.md"]);
  assert.deepEqual(snapshot.leftOut, [{ file: "context/locked.md", reason: "permission denied" }]);
});

test("a file that is not text is left out, and so is a context folder that is not a folder", async (t) => {
  const { paths, write } = newHome(t);
  write("context/binary.md", "abc\0def");
  const noted = await readHomeSnapshot(paths);
  assert.deepEqual(noted.files, []);
  assert.deepEqual(noted.leftOut, [{ file: "context/binary.md", reason: "it is not text" }]);

  rmSync(paths.context, { recursive: true });
  write("context", "I am a file.\n");
  const flat = await readHomeSnapshot(paths);
  assert.deepEqual(flat.leftOut, [{ file: "context", reason: "it is not a folder" }]);
});

test("SOUL.md that is a folder is left out and named", async (t) => {
  const { paths, write } = newHome(t);
  write("SOUL.md/inside.md", "x");

  const snapshot = await readHomeSnapshot(paths);

  assert.equal(snapshot.soul, undefined);
  assert.deepEqual(snapshot.leftOut, [{ file: "SOUL.md", reason: "it is a folder, not a file" }]);
});

test("links to files and folders are followed, a link back on itself ends, and a broken one is named", async (t) => {
  const { paths, write } = newHome(t);
  const shared = write("shared/team.md", "Team notes.\n");
  write("shared/more/extra.md", "Extra.\n");
  mkdirSync(paths.context, { recursive: true });
  symlinkSync(shared, join(paths.context, "team.md"));
  symlinkSync(join(paths.root, "shared", "more"), join(paths.context, "more"));
  symlinkSync(paths.context, join(paths.context, "again"));
  symlinkSync(join(paths.root, "nowhere.md"), join(paths.context, "gone.md"));

  const snapshot = await readHomeSnapshot(paths);

  assert.deepEqual(snapshot.files.map((file) => file.path), ["context/more/extra.md", "context/team.md"]);
  assert.deepEqual(snapshot.leftOut, [{ file: "context/gone.md", reason: "it is a link to nothing" }]);
});

test("a skill's name is its front matter's, or else its folder's, and its description is one line", async (t) => {
  const { paths, write } = newHome(t);
  write("skills/folder-name/SKILL.md", skill("Named by its folder."));
  write(
    "skills/journal/SKILL.md",
    ["---", "name: daily-journal", "description: |", "  Write the day up.", "  Keep it short.", "---", "body"].join("\n"),
  );

  const snapshot = await readHomeSnapshot(paths);

  assert.deepEqual(
    snapshot.skills.map((each) => [each.name, each.description]),
    [
      ["daily-journal", "Write the day up. Keep it short."],
      ["folder-name", "Named by its folder."],
    ],
  );
});

test("a skill with no description, or no front matter, is left out and named; a folder that is not a skill is not", async (t) => {
  const { paths, write } = newHome(t);
  write("skills/ok/SKILL.md", skill("Works."));
  write("skills/no-description/SKILL.md", "---\nname: no-description\n---\nbody\n");
  write("skills/no-front-matter/SKILL.md", "# Just a title\n");
  write("skills/assets/diagram.png", "not a skill");
  write("skills/.hidden/SKILL.md", skill("Hidden."));
  write("skills/README.md", "A file among the skills.\n");

  const snapshot = await readHomeSnapshot(paths);

  assert.deepEqual(snapshot.skills.map((each) => each.name), ["ok"]);
  assert.deepEqual(snapshot.leftOut, [
    { file: "skills/no-description/SKILL.md", reason: "its front matter has no description" },
    {
      file: "skills/no-front-matter/SKILL.md",
      reason: "it does not start with a front matter block, between --- lines",
    },
  ]);
});

test("a folder of skills that is linked in counts, and a SKILL.md that is a folder is named", async (t) => {
  const { paths, write } = newHome(t);
  write("elsewhere/shared-skill/SKILL.md", skill("Shared between homes."));
  mkdirSync(paths.skills, { recursive: true });
  symlinkSync(join(paths.root, "elsewhere", "shared-skill"), join(paths.skills, "shared-skill"));
  write("skills/odd/SKILL.md/inside.md", "x");

  const snapshot = await readHomeSnapshot(paths);

  assert.deepEqual(snapshot.skills.map((each) => each.name), ["shared-skill"]);
  assert.deepEqual(snapshot.leftOut, [{ file: "skills/odd/SKILL.md", reason: "it is a folder, not a file" }]);
});
