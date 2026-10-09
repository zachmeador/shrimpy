import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

/** A file the agent was not given, and why. */
export interface LeftOut {
  /** Where it is inside the home, with `/` between folders, or its absolute path when it is not in the home. */
  readonly file: string;
  /** Short, so that "<file> was left out: <reason>." reads as a sentence. */
  readonly reason: string;
}

/** A left-out file as a sentence, which is how the agent says it on standard error and in the breadcrumb it leaves. */
export const leftOutSentence = ({ file, reason }: LeftOut): string => `${file} was left out: ${reason}.`;

/** Where `path` is, as a left-out file says: inside `root` with `/` between folders, or its absolute path when it is not in `root`. */
export function shownIn(root: string, path: string): string {
  const inside = relative(root, path);
  const outside = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return inside === "" || outside ? path : inside.split(sep).join("/");
}

/** What reading a text file found. A file that is not there is not a problem; one that cannot be used is. */
export type Read =
  | { kind: "text"; text: string }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string };

export async function readText(path: string): Promise<Read> {
  try {
    const text = await readFile(path, "utf8");
    return text.includes("\0") ? { kind: "unreadable", reason: "it is not text" } : { kind: "text", text };
  } catch (error) {
    return codeOf(error) === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", reason: why(error) };
  }
}

/**
 * `text` cut to at most `limit` characters, never between the two halves of a
 * character that takes two, with a last line that says it was cut. Text that
 * fits is as it is.
 */
export function cutText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const last = text.charCodeAt(limit - 1);
  const splitsAPair = last >= 0xd800 && last <= 0xdbff;
  return `${text.slice(0, splitsAPair ? limit - 1 : limit).trimEnd()}\n[cut here: there is more]`;
}

/** Plain order of the characters, which does not change with the machine's language. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Why a file could not be read, in a few words that finish "<file> was left out: <reason>." */
export function why(error: unknown): string {
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

/** Write `text` to a file beside `file` and move it into place, so that `file` is always whole. A hidden file is no trigger. */
export async function replaceFile(file: string, text: string): Promise<void> {
  const temporary = join(dirname(file), `.${basename(file)}.${String(process.pid)}.tmp`);
  try {
    await writeFile(temporary, text);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
