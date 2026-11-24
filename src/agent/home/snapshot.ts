import { relative, sep } from "node:path";
import { compare, type LeftOut, type MarkdownFile, stillHeld, stillKept, takesIn } from "../../lib/files/index.ts";
import { readMarkdown, readText } from "../../lib/files/node.ts";
import { isInside, shownIn } from "./files.ts";
import { INCLUDED_SKILLS } from "./included.ts";
import type { HomePaths } from "./layout.ts";
import { mergeSkills, readSkills, type SkillTrail } from "./skills.ts";
import { readWorkspaceCopy } from "./workspace.ts";

/**
 * What the home's files tell the agent, read once. Reading it again is a
 * reload; nothing in it changes by itself.
 */
export interface HomeSnapshot {
  /** The text of `SOUL.md`, when it has any. */
  readonly soul: string | undefined;
  /** The files of the workspace context, from the home's copy, by their paths on the gateway's machine, in order of path. */
  readonly workspace: readonly MarkdownFile[];
  /** The Markdown files of `context/` and the folders under it, by where each is in the home, in order of path. */
  readonly files: readonly MarkdownFile[];
  /** The skills the agent is shown, in order of name: the home's, and those that ship with Shrimpy. */
  readonly skills: readonly SkillTrail[];
  /** What could not be read or used. Everything else was read anyway. */
  readonly leftOut: readonly LeftOut[];
}

/**
 * Read `SOUL.md`, the home's copy of the workspace context, the Markdown files
 * of `context/` and the skills: those of `skills/`, and those that ship with
 * Shrimpy, where a skill of the home with the same name replaces the included
 * one. A file that cannot be read, or a skill that is not written right, is
 * left out and named in `leftOut`; it never stops the rest. Hidden files and
 * folders are skipped, and links are followed.
 */
export async function readHomeSnapshot(paths: HomePaths): Promise<HomeSnapshot> {
  const leftOut: LeftOut[] = [];
  const inHome = (path: string): string => relative(paths.root, path).split(sep).join("/");

  const soul = await readText(paths.soul);
  if (soul.kind === "unreadable") leftOut.push({ file: inHome(paths.soul), reason: soul.reason });

  const workspace = await readWorkspaceCopy(paths, inHome);
  leftOut.push(...workspace.leftOut);
  const context = await readMarkdown(paths.context, { named: inHome });
  leftOut.push(...context.leftOut);

  const own = await readSkills(paths.skills, inHome, leftOut);
  // Where the files of a skill that ships with Shrimpy are, if any is wrong, is told in full: they are not in the home.
  const included = await readSkills(INCLUDED_SKILLS, (path) => path, leftOut);
  return {
    soul: soul.kind === "text" && soul.text.trim() !== "" ? soul.text : undefined,
    workspace: workspace.files,
    files: context.files,
    skills: mergeSkills(own, included),
    leftOut,
  };
}

/**
 * `read`, the reading just made, where what it left out is what the reading
 * before it, `previous`, had: `SOUL.md`, a file of the workspace context's
 * copy, a file or folder of `context/`, or a skill. The agent goes on with what
 * it had of it, the text or the description, instead of losing it from its
 * instructions for a save that is broken or a read that failed. It is still
 * named as left out, and its reason says that what was last read of it is kept.
 * Only what a reading names is carried over: a file that is gone is not named,
 * and so is gone, and neither is one the reading before did not have.
 * `previous` is what the agent holds, so a file that stays unusable stays as it
 * was when it was last read.
 */
export function carryOver(previous: HomeSnapshot, read: HomeSnapshot, paths: HomePaths): HomeSnapshot {
  const heldBack = (held: string): boolean => read.leftOut.some(({ file }) => takesIn(file, held));

  const soul = read.soul === undefined && previous.soul !== undefined && heldBack("SOUL.md") ? previous.soul : undefined;
  // A file of the copy is left out under where it is in the home, and read as its path on the gateway's machine.
  const copy = shownIn(paths.root, paths.workspaceContext);
  const inCopy = (path: string): string => `${copy}${path}`;
  const workspace = stillHeld(previous.workspace, read.workspace, read.leftOut, inCopy);
  const files = stillHeld(previous.files, read.files, read.leftOut);
  // A skill is left out under the path its reading shows: inside the home, or in full for one that ships with Shrimpy.
  const isOwn = (skill: SkillTrail): boolean => isInside(paths.skills, skill.file);
  const shown = (skill: SkillTrail): string => (isOwn(skill) ? shownIn(paths.root, skill.file) : skill.file);
  const haveSkills = new Set(read.skills.map(({ file }) => file));
  const skills = previous.skills.filter((skill) => !haveSkills.has(skill.file) && heldBack(shown(skill)));
  if (soul === undefined && workspace.length === 0 && files.length === 0 && skills.length === 0) return read;

  const kept = (left: string): boolean =>
    (soul !== undefined && left === "SOUL.md") ||
    workspace.some(({ path }) => takesIn(left, inCopy(path))) ||
    files.some(({ path }) => takesIn(left, path)) ||
    skills.some((skill) => takesIn(left, shown(skill)));
  const all = [...read.skills, ...skills];
  return {
    soul: soul ?? read.soul,
    workspace: [...read.workspace, ...workspace].sort((a, b) => compare(a.path, b.path)),
    files: [...read.files, ...files].sort((a, b) => compare(a.path, b.path)),
    // A skill of the home that is carried over replaces a skill that ships under the same name, as one that is read does.
    skills: mergeSkills(all.filter(isOwn), all.filter((skill) => !isOwn(skill))),
    leftOut: read.leftOut.map((each) => (kept(each.file) ? stillKept(each) : each)),
  };
}
