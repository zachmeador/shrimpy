import type { Dirent, Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { codeOf, compare, isMarkdown } from "../../lib/files/index.ts";
import { listFolder } from "../../lib/files/node.ts";
import { INCLUDED_SKILLS } from "./included.ts";
import type { HomePaths } from "./layout.ts";
import { walkContext } from "./walk.ts";

/**
 * A look at the files that reading the home reads: `SOUL.md`, the Markdown files
 * of `context/`, the skills of the home and those that ship with Shrimpy, the
 * Markdown files of `triggers/`, the wake file, `agent.json`, `sigil`, and
 * `outside`, the other files the agent reads, such as its model files. It gives their names,
 * sizes, modes and the times they were changed, and never opens one, so it is
 * cheap enough to repeat every few seconds. The mode is there because a file
 * that is made unreadable, or readable again, changes neither its size nor its
 * time. Two looks are the same text when none of those files has changed
 * between them. It never fails: a file that can't be looked at is in the text
 * with the reason. It picks the files that `readHomeSnapshot` and
 * `readTriggers` read, with the same walk of `context/` and the same listing of
 * a folder, so whatever they would read differently shows in the look.
 */
export async function lookAtHome(paths: HomePaths, outside: readonly string[] = []): Promise<string> {
  const found = new Map<string, string>();
  await Promise.all([
    ...[paths.soul, paths.wake, paths.config, paths.sigil, ...outside].map(async (file) => void found.set(file, await lookAtFile(file))),
    lookAtContext(paths.context, found),
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

/** The Markdown files under `folder`, as reading the home walks it, and the folders there that can't be read. */
async function lookAtContext(folder: string, found: Map<string, string>): Promise<void> {
  for await (const entry of walkContext(folder)) found.set(entry.path, entry.kind === "markdown" ? describe(entry.info) : why(entry.error));
}

/** The `SKILL.md` of each folder under `folder`: whether there is one is what makes the folder a skill. */
function lookAtSkills(folder: string, found: Map<string, string>): Promise<void> {
  return lookInFolder(folder, found, undefined, async (directory) => {
    if (!(await stat(directory).then((info) => info.isDirectory(), () => false))) return;
    const file = join(directory, "SKILL.md");
    found.set(file, await lookAtFile(file));
  });
}

/** The Markdown files directly in `folder`. */
function lookAtTriggers(folder: string, found: Map<string, string>): Promise<void> {
  return lookInFolder(folder, found, isMarkdown, async (file) => void found.set(file, await lookAtFile(file)));
}

/** Look at each entry of `folder` that `keep` takes, as `listFolder` lists them, by its path, or say why the folder can't be read. */
async function lookInFolder(
  folder: string,
  found: Map<string, string>,
  keep: ((name: string) => boolean) | undefined,
  look: (path: string) => Promise<void>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await listFolder(folder, keep);
  } catch (error) {
    found.set(folder, why(error));
    return;
  }
  await Promise.all(entries.map(({ name }) => look(join(folder, name))));
}
