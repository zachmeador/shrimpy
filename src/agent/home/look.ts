import type { Dirent, Stats } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { codeOf, compare } from "./files.ts";
import { INCLUDED_SKILLS } from "./included.ts";
import type { HomePaths } from "./layout.ts";

/**
 * A look at the files that reading the home reads: `SOUL.md`, the Markdown files
 * of `context/`, the skills of the home and those that ship with Shrimpy, the
 * Markdown files of `triggers/`, the wake file, `agent.json`, and `outside`, the
 * other files the agent reads, such as its model files. It gives their names,
 * sizes, modes and the times they were changed, and never opens one, so it is
 * cheap enough to repeat every few seconds. The mode is there because a file
 * that is made unreadable, or readable again, changes neither its size nor its
 * time. Two looks are the same text when none of those files has changed
 * between them. It never fails: a file that can't be looked at is in the text
 * with the reason. It picks the files that
 * `readHomeSnapshot` and `readTriggers` read, so whatever they would read
 * differently shows in the look.
 */
export async function lookAtHome(paths: HomePaths, outside: readonly string[] = []): Promise<string> {
  const found = new Map<string, string>();
  await Promise.all([
    ...[paths.soul, paths.wake, paths.config, ...outside].map(async (file) => void found.set(file, await lookAtFile(file))),
    lookAtContext(paths.context, new Set(), found),
    lookAtSkills(paths.skills, found),
    lookAtSkills(INCLUDED_SKILLS, found),
    lookAtTriggers(paths.triggers, found),
  ]);
  return JSON.stringify([...found].sort(([a], [b]) => compare(a, b)));
}

/** What one file looks like: its size, when it was changed and who may read it. */
const describe = (info: Stats): string =>
  info.isFile() ? `${String(info.size)} ${String(info.mtimeMs)} ${info.mode.toString(8)}` : "not a file";

const why = (error: unknown): string => codeOf(error) ?? "unreadable";

async function lookAtFile(path: string): Promise<string> {
  try {
    return describe(await stat(path));
  } catch (error) {
    return why(error);
  }
}

/** An entry of a folder, looked at: what it is, or why that can't be said. */
type Looked = { path: string; info: Stats } | { path: string; failure: string };

const isHidden = (entry: Dirent): boolean => entry.name.startsWith(".");
const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith(".md");

/**
 * The Markdown files under `folder`, folders under it included, links followed.
 * A folder that was looked at already by another path is not looked at again, as
 * `readHomeSnapshot` has it. The folders are taken in order of name, one after
 * the other, so the same path is the one that is skipped every time.
 */
async function lookAtContext(folder: string, seen: Set<string>, found: Map<string, string>): Promise<void> {
  let entries: Dirent[];
  try {
    const real = await realpath(folder);
    if (seen.has(real)) return;
    seen.add(real);
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    found.set(folder, why(error));
    return;
  }
  const visible = entries.filter((entry) => !isHidden(entry)).sort((a, b) => compare(a.name, b.name));
  const looks = await Promise.all(
    visible.map(async ({ name }): Promise<Looked> => {
      const path = join(folder, name);
      try {
        return { path, info: await stat(path) };
      } catch (error) {
        return { path, failure: why(error) };
      }
    }),
  );
  for (const look of looks) {
    if ("info" in look && look.info.isDirectory()) await lookAtContext(look.path, seen, found);
    else if (isMarkdown(look.path)) found.set(look.path, "info" in look ? describe(look.info) : look.failure);
  }
}

/** The `SKILL.md` of each folder under `folder`: whether there is one is what makes the folder a skill. */
async function lookAtSkills(folder: string, found: Map<string, string>): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    found.set(folder, why(error));
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => !isHidden(entry))
      .map(async ({ name }) => {
        const directory = join(folder, name);
        if (!(await stat(directory).then((info) => info.isDirectory(), () => false))) return;
        const file = join(directory, "SKILL.md");
        found.set(file, await lookAtFile(file));
      }),
  );
}

/** The Markdown files directly in `folder`. */
async function lookAtTriggers(folder: string, found: Map<string, string>): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    found.set(folder, why(error));
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => !isHidden(entry) && isMarkdown(entry.name))
      .map(async ({ name }) => {
        const file = join(folder, name);
        found.set(file, await lookAtFile(file));
      }),
  );
}
