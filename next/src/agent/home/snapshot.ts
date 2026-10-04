import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { frontmatter, oneLine } from "./frontmatter.ts";
import type { HomePaths } from "./layout.ts";

/** A Markdown file from the home's `context/` folder. */
export interface ContextFile {
  /** Where it is inside the home, with `/` between folders. */
  readonly path: string;
  readonly text: string;
}

/** A skill as the agent is shown it: what it is for and where to read it. */
export interface SkillTrail {
  readonly name: string;
  /** What the skill is for, on one line. */
  readonly description: string;
  /** The absolute path of its `SKILL.md`. */
  readonly file: string;
}

/** A file the agent was not given, and why. */
export interface LeftOut {
  /** Where it is inside the home, with `/` between folders. */
  readonly file: string;
  /** Short, so that "<file> was left out: <reason>." reads as a sentence. */
  readonly reason: string;
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
  /** The skills in `skills/`, in order of name. */
  readonly skills: readonly SkillTrail[];
  /** What could not be read or used. Everything else was read anyway. */
  readonly leftOut: readonly LeftOut[];
}

/**
 * Read `SOUL.md`, the Markdown files of `context/` and the skills of `skills/`.
 * A file that cannot be read, or a skill that is not written right, is left out
 * and named in `leftOut`; it never stops the rest. Hidden files and folders are
 * skipped, and links are followed. A skill is a folder of `skills/` with a
 * `SKILL.md` whose front matter has a description and may have a name.
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

  return {
    soul: soul.kind === "text" && soul.text.trim() !== "" ? soul.text : undefined,
    files: files.sort((a, b) => compare(a.path, b.path)),
    skills: await readSkills(paths, inHome, leftOut),
    leftOut,
  };
}

async function readSkills(
  paths: HomePaths,
  inHome: (path: string) => string,
  leftOut: LeftOut[],
): Promise<SkillTrail[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(paths.skills, { withFileTypes: true });
  } catch (error) {
    if (codeOf(error) !== "ENOENT") leftOut.push({ file: inHome(paths.skills), reason: why(error) });
    return [];
  }
  const skills: SkillTrail[] = [];
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    if (entry.name.startsWith(".")) continue;
    const folder = join(paths.skills, entry.name);
    if (!(await stat(folder).then((info) => info.isDirectory(), () => false))) continue;
    const file = join(folder, "SKILL.md");
    const read = await readText(file);
    // A folder with no SKILL.md is not a skill, and may hold anything.
    if (read.kind === "missing") continue;
    if (read.kind === "unreadable") {
      leftOut.push({ file: inHome(file), reason: read.reason });
      continue;
    }
    const values = frontmatter(read.text);
    const description = values?.get("description") ?? "";
    if (values === undefined) {
      leftOut.push({ file: inHome(file), reason: "it does not start with a front matter block, between --- lines" });
    } else if (description === "") {
      leftOut.push({ file: inHome(file), reason: "its front matter has no description" });
    } else {
      skills.push({ name: oneLine(values.get("name") ?? "") || entry.name, description, file });
    }
  }
  return skills.sort((a, b) => compare(a.name, b.name) || compare(a.file, b.file));
}

type Read =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string };

async function readText(path: string): Promise<Read> {
  try {
    const text = await readFile(path, "utf8");
    return text.includes("\0") ? { kind: "unreadable", reason: "it is not text" } : { kind: "text", text };
  } catch (error) {
    return codeOf(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", reason: why(error) };
  }
}

const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith(".md");

/** Plain order of the characters, which does not change with the machine's language. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

function why(error: unknown): string {
  switch (codeOf(error)) {
    case "EACCES":
    case "EPERM":
      return "permission denied";
    case "EISDIR":
      return "it is a folder, not a file";
    case "ENOTDIR":
      return "it is not a folder";
    default:
      return error instanceof Error ? error.message : String(error);
  }
}

function brokenLink(error: unknown): string {
  return codeOf(error) === "ENOENT" ? "it is a link to nothing" : why(error);
}
