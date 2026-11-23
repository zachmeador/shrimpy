import { codeOf, compare, type LeftOut, type MarkdownFile, why, whyUnseen } from "./files.ts";
import { readText } from "./read.node.ts";
import { walkMarkdown } from "./walk.node.ts";

/** What reading a folder of Markdown files found. */
export interface MarkdownRead {
  /** The files with something in them, in order of path. */
  readonly files: MarkdownFile[];
  /** What could not be read. Everything else was read anyway. */
  readonly leftOut: LeftOut[];
}

/**
 * Read the Markdown files under `folder` and the folders under it, as
 * `walkMarkdown` finds them, each with the path `named` gives it. A file with
 * nothing in it but space is as if it were not there, and so is a folder that
 * isn't. A file or folder that can't be read is left out under the path
 * `leftOutAs` gives it, which is `named` unless the reader tells a person where
 * it is some other way, and never stops the rest.
 */
export async function readMarkdown(
  folder: string,
  named: (path: string) => string,
  leftOutAs: (path: string) => string = named,
): Promise<MarkdownRead> {
  const files: MarkdownFile[] = [];
  const leftOut: LeftOut[] = [];
  for await (const entry of walkMarkdown(folder)) {
    if (entry.kind === "unread") {
      if (codeOf(entry.error) !== "ENOENT") leftOut.push({ file: leftOutAs(entry.path), reason: why(entry.error) });
    } else if (entry.kind === "unseen") {
      leftOut.push({ file: leftOutAs(entry.path), reason: whyUnseen(entry.error) });
    } else if (entry.info.isFile()) {
      const read = await readText(entry.path);
      if (read.kind === "unreadable") leftOut.push({ file: leftOutAs(entry.path), reason: read.reason });
      else if (read.kind === "text" && read.text.trim() !== "") files.push({ path: named(entry.path), text: read.text });
    }
  }
  return { files: files.sort((a, b) => compare(a.path, b.path)), leftOut };
}
