import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { codeOf, compare, type LeftOut, readText, why } from "./files.ts";
import { frontmatter, oneLine } from "./frontmatter.ts";

/** A skill as the agent is shown it: what it is for and where to read it. */
export interface SkillTrail {
  readonly name: string;
  /** What the skill is for, on one line. */
  readonly description: string;
  /** The absolute path of its `SKILL.md`. */
  readonly file: string;
}

/**
 * The skills in one folder: each subfolder with a `SKILL.md` whose front matter
 * has a description, and may have a name. A subfolder with no `SKILL.md` is
 * not a skill and may hold anything. A skill that is not written right is left
 * out and named, as `shown` writes its path; it never stops the rest.
 */
export async function readSkills(
  folder: string,
  shown: (path: string) => string,
  leftOut: LeftOut[],
): Promise<SkillTrail[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (codeOf(error) !== "ENOENT") leftOut.push({ file: shown(folder), reason: why(error) });
    return [];
  }
  const skills: SkillTrail[] = [];
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    if (entry.name.startsWith(".")) continue;
    const directory = join(folder, entry.name);
    if (!(await stat(directory).then((info) => info.isDirectory(), () => false))) continue;
    const file = join(directory, "SKILL.md");
    const read = await readText(file);
    if (read.kind === "missing") continue;
    if (read.kind === "unreadable") {
      leftOut.push({ file: shown(file), reason: read.reason });
      continue;
    }
    const values = frontmatter(read.text);
    const description = values?.get("description") ?? "";
    if (values === undefined) {
      leftOut.push({ file: shown(file), reason: "it does not start with a front matter block, between --- lines" });
    } else if (description === "") {
      leftOut.push({ file: shown(file), reason: "its front matter has no description" });
    } else {
      skills.push({ name: oneLine(values.get("name") ?? "") || entry.name, description, file });
    }
  }
  return skills;
}

/**
 * The skills an agent is shown, in order of name: the home's own, and the ones
 * that ship with Shrimpy, except those the home has a skill of the same name
 * for. The home's skill replaces the included one.
 */
export function mergeSkills(own: readonly SkillTrail[], included: readonly SkillTrail[]): SkillTrail[] {
  const replaced = new Set(own.map((skill) => skill.name));
  return [...own, ...included.filter((skill) => !replaced.has(skill.name))].sort(
    (a, b) => compare(a.name, b.name) || compare(a.file, b.file),
  );
}
