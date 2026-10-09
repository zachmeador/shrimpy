import type { Dirent } from "node:fs";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { compare, cutText, replaceFile } from "./files.ts";
import type { HomePaths } from "./layout.ts";

/** A breadcrumb as the home's files have it: the file's name, and what it says, trimmed and cut. */
export interface BreadcrumbFile {
  name: string;
  text: string;
}

/** The most characters of a breadcrumb that are kept. */
const LONGEST = 1_000;

/** Enough bytes of a file for more than `LONGEST` characters, however they are written. */
const READ = 4 * LONGEST + 4;

/**
 * Read the `breadcrumbs/` folder: each Markdown file in it, hidden files and
 * folders aside, is a breadcrumb, in order of name, with its text trimmed and cut
 * at 1,000 characters. A file with nothing in it, or that is not text, is as if it
 * were not there. So is a folder that is missing or cannot be read. This is asked
 * before every input is taken up, so it never fails and never reads far into a
 * file: a breadcrumb that cannot be read, or that is huge, must not be the reason
 * an input is not taken up.
 */
export async function readBreadcrumbs(paths: HomePaths): Promise<BreadcrumbFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(paths.breadcrumbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: BreadcrumbFile[] = [];
  for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
    if (entry.name.startsWith(".") || !entry.name.toLowerCase().endsWith(".md")) continue;
    const text = (await startOf(join(paths.breadcrumbs, entry.name)))?.trim();
    if (text !== undefined && text !== "") found.push({ name: entry.name, text: cutText(text, LONGEST) });
  }
  return found;
}

/** The start of a file as text, or undefined when it is not a file, is not text or cannot be read. */
async function startOf(file: string): Promise<string | undefined> {
  try {
    if (!(await stat(file)).isFile()) return undefined;
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(READ);
      const { bytesRead } = await handle.read(buffer, 0, READ, 0);
      const text = buffer.toString("utf8", 0, bytesRead);
      return text.includes("\0") ? undefined : text;
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Write the breadcrumb `<name>.md`, in place of the one of that name if there is
 * one, making the folder if the home has none. Whoever reads the folder at the
 * same moment sees the file whole or not at all.
 */
export async function writeBreadcrumb(paths: HomePaths, name: string, text: string): Promise<void> {
  await mkdir(paths.breadcrumbs, { recursive: true });
  await replaceFile(join(paths.breadcrumbs, `${name}.md`), text);
}

/** Delete the breadcrumb `<name>.md`, when the fact it told is no longer one. A breadcrumb that is not there is no problem. */
export async function removeBreadcrumb(paths: HomePaths, name: string): Promise<void> {
  await rm(join(paths.breadcrumbs, `${name}.md`), { force: true });
}
