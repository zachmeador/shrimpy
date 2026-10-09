import type { Dirent, Stats } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { codeOf, compare, type LeftOut, readText, shownIn, why } from "./files.ts";
import { INCLUDED_SKILLS } from "./included.ts";
import type { HomePaths } from "./layout.ts";
import { mergeSkills, readSkills, type SkillTrail } from "./skills.ts";

/** A Markdown file from the home's `context/` folder. */
export interface ContextFile {
  /** Where it is inside the home, with `/` between folders. */
  readonly path: string;
  readonly text: string;
}

/**
 * What the home's files tell the agent, read once. Reading it again is a
 * reload; nothing in it changes by itself.
 */
export interface HomeSnapshot {
  /** The text of `SOUL.md`, when it has any. */
  readonly soul: string | undefined;
  /** The Markdown files of `context/` and the folders under it, in order of path. */
  readonly files: readonly ContextFile[];
  /** The skills the agent is shown, in order of name: the home's, and those that ship with Shrimpy. */
  readonly skills: readonly SkillTrail[];
  /** What could not be read or used. Everything else was read anyway. */
  readonly leftOut: readonly LeftOut[];
}

/**
 * Read `SOUL.md`, the Markdown files of `context/` and the skills: those of
 * `skills/`, and those that ship with Shrimpy, where a skill of the home with
 * the same name replaces the included one. A file that cannot be read, or a
 * skill that is not written right, is left out and named in `leftOut`; it
 * never stops the rest. Hidden files and folders are skipped, and links are
 * followed.
 */
export async function readHomeSnapshot(paths: HomePaths): Promise<HomeSnapshot> {
  const leftOut: LeftOut[] = [];
  const inHome = (path: string): string => relative(paths.root, path).split(sep).join("/");

  const soul = await readText(paths.soul);
  if (soul.kind === "unreadable") leftOut.push({ file: inHome(paths.soul), reason: soul.reason });

  const files: ContextFile[] = [];
  const seen = new Set<string>();
  const walk = async (folder: string): Promise<void> => {
    let entries: Dirent[];
    try {
      const real = await realpath(folder);
      // A link back to a folder already read would never end.
      if (seen.has(real)) return;
      seen.add(real);
      entries = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (codeOf(error) !== "ENOENT") leftOut.push({ file: inHome(folder), reason: why(error) });
      return;
    }
    for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
      if (entry.name.startsWith(".")) continue;
      const path = join(folder, entry.name);
      let info: Stats;
      try {
        info = await stat(path);
      } catch (error) {
        if (isMarkdown(entry.name)) leftOut.push({ file: inHome(path), reason: brokenLink(error) });
        continue;
      }
      if (info.isDirectory()) {
        await walk(path);
      } else if (info.isFile() && isMarkdown(entry.name)) {
        const read = await readText(path);
        if (read.kind === "unreadable") leftOut.push({ file: inHome(path), reason: read.reason });
        else if (read.kind === "text" && read.text.trim() !== "") files.push({ path: inHome(path), text: read.text });
      }
    }
  };
  await walk(paths.context);

  const own = await readSkills(paths.skills, inHome, leftOut);
  // Where the files of a skill that ships with Shrimpy are, if any is wrong, is told in full: they are not in the home.
  const included = await readSkills(INCLUDED_SKILLS, (path) => path, leftOut);
  return {
    soul: soul.kind === "text" && soul.text.trim() !== "" ? soul.text : undefined,
    files: files.sort((a, b) => compare(a.path, b.path)),
    skills: mergeSkills(own, included),
    leftOut,
  };
}

const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith(".md");

function brokenLink(error: unknown): string {
  return codeOf(error) === "ENOENT" ? "it is a link to nothing" : why(error);
}

/** What a left-out file says when the agent goes on with what it had of it. */
const KEPT = "so what was last read of it is kept";

/**
 * `read`, the reading just made, where what it left out is what the reading
 * before it, `previous`, had: `SOUL.md`, a file or folder of `context/`, or a
 * skill. The agent goes on with what it had of it, the text or the description,
 * instead of losing it from its instructions for a save that is broken or a read
 * that failed. It is still named as left out, and its reason says that what was
 * last read of it is kept. Only what a reading names is carried over: a file
 * that is gone is not named, and so is gone, and neither is one the reading before
 * did not have. `previous` is what the agent holds, so a file that stays
 * unusable stays as it was when it was last read.
 */
export function carryOver(previous: HomeSnapshot, read: HomeSnapshot, paths: HomePaths): HomeSnapshot {
  const covers = (left: string, held: string): boolean => held === left || held.startsWith(`${left}/`);
  const heldBack = (held: string): boolean => read.leftOut.some(({ file }) => covers(file, held));

  const soul = read.soul === undefined && previous.soul !== undefined && heldBack("SOUL.md") ? previous.soul : undefined;
  const have = new Set(read.files.map(({ path }) => path));
  const files = previous.files.filter(({ path }) => !have.has(path) && heldBack(path));
  // A skill is left out under the path its reading shows: inside the home, or in full for one that ships with Shrimpy.
  const isOwn = (skill: SkillTrail): boolean => skill.file.startsWith(`${paths.skills}${sep}`);
  const shown = (skill: SkillTrail): string => (isOwn(skill) ? shownIn(paths.root, skill.file) : skill.file);
  const haveSkills = new Set(read.skills.map(({ file }) => file));
  const skills = previous.skills.filter((skill) => !haveSkills.has(skill.file) && heldBack(shown(skill)));
  if (soul === undefined && files.length === 0 && skills.length === 0) return read;

  const kept = (left: string): boolean =>
    (soul !== undefined && left === "SOUL.md") ||
    files.some(({ path }) => covers(left, path)) ||
    skills.some((skill) => covers(left, shown(skill)));
  const all = [...read.skills, ...skills];
  return {
    soul: soul ?? read.soul,
    files: [...read.files, ...files].sort((a, b) => compare(a.path, b.path)),
    // A skill of the home that is carried over replaces a skill that ships under the same name, as one that is read does.
    skills: mergeSkills(all.filter(isOwn), all.filter((skill) => !isOwn(skill))),
    leftOut: read.leftOut.map((each) => (kept(each.file) ? { file: each.file, reason: `${each.reason}, ${KEPT}` } : each)),
  };
}
