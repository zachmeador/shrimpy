import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { codeOf } from "./files.ts";
import { walkMarkdown } from "./walk.node.ts";

/**
 * What one file looks like: its size, when it was changed and who may read it.
 * The mode is there because a file that is made unreadable, or readable again,
 * changes neither its size nor its time.
 */
const describe = (info: Stats): string =>
  info.isFile() ? `${String(info.size)} ${String(info.mtimeMs)} ${info.mode.toString(8)}` : "not a file";

/** Why a file or folder can't be looked at, as a look shows it. */
export const whyNotLooked = (error: unknown): string => codeOf(error) ?? "unreadable";

/** What `path` looks like, or why it can't be looked at. It never opens the file and never fails. */
export async function lookAtFile(path: string): Promise<string> {
  try {
    return describe(await stat(path));
  } catch (error) {
    return whyNotLooked(error);
  }
}

/** What each Markdown file under `folder` looks like, as `walkMarkdown` finds them, and the folders there that can't be read, added to `found` by path. */
export async function lookAtMarkdown(folder: string, found: Map<string, string>): Promise<void> {
  for await (const entry of walkMarkdown(folder)) found.set(entry.path, entry.kind === "markdown" ? describe(entry.info) : whyNotLooked(entry.error));
}
