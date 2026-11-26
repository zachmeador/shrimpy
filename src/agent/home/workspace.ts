import { mkdir, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asError } from "../../lib/errors/index.ts";
import { isMarkdown, type MarkdownFile } from "../../lib/files/index.ts";
import { type MarkdownRead, readMarkdown, saveFile, walkMarkdown } from "../../lib/files/node.ts";
import { isInside } from "./files.ts";
import type { HomePaths } from "./layout.ts";

/** What keeps the home's copy of the workspace context. */
export interface WorkspaceCopier {
  /** Copy these files, once the copy before them is done. */
  copy(files: readonly MarkdownFile[]): void;
  /** Copy nothing more, and wait for the copy under way. */
  close(): Promise<void>;
}

/**
 * Keep the home's copy of the workspace context, which the agent reads its
 * instructions from, as the gateway's changes: each set of files is copied
 * after the one before it, and `changed` is told after a copy that changed
 * something, so the agent reads its home again at once. A copy that fails is
 * said on `onError`, and the next set tries again.
 */
export function workspaceCopier(paths: HomePaths, options: { changed(): Promise<unknown>; onError(error: Error): void }): WorkspaceCopier {
  let queue: Promise<void> = Promise.resolve();
  let closed = false;
  return {
    copy(files) {
      if (closed) return;
      queue = queue
        .then(async () => {
          if (!closed && (await keepWorkspaceCopy(paths, files))) await options.changed();
        })
        .catch((error: unknown) => {
          options.onError(new Error(`The copy of the workspace context in ${paths.workspaceContext} could not be kept: ${asError(error).message}`));
        });
    },
    async close() {
      closed = true;
      await queue;
    },
  };
}

/**
 * Read the home's copy of the workspace context, each file by its path on the
 * gateway's machine: the copy keeps every file at that path inside it. What
 * can't be read is left out under the path `leftOutAs` gives it.
 */
export async function readWorkspaceCopy(paths: HomePaths, leftOutAs?: (path: string) => string): Promise<MarkdownRead> {
  const read = await readMarkdown(paths.workspaceContext, leftOutAs === undefined ? {} : { leftOutAs });
  return { ...read, files: read.files.map(({ path, text }) => ({ path: `/${path}`, text })) };
}

/**
 * Make the home's copy of the workspace context hold `files`, each named by its
 * full path on the gateway's machine, and nothing else:
 * a file whose text differs is saved whole, and a Markdown file that isn't
 * among them is deleted, with each folder that leaves empty. A path that would
 * leave the copy, or isn't a Markdown file's, is passed by. Returns whether
 * anything changed.
 */
export async function keepWorkspaceCopy(paths: HomePaths, files: readonly MarkdownFile[]): Promise<boolean> {
  const root = paths.workspaceContext;
  const at = (path: string): string => join(root, ...path.split("/"));
  const wanted = files.filter(({ path }) => isMarkdown(path) && isInside(root, at(path)));
  const had = await readWorkspaceCopy(paths);
  const texts = new Map(had.files.map(({ path, text }) => [path, text]));
  let changed = false;
  for (const { path, text } of wanted) {
    if (texts.get(path) === text) continue;
    await mkdir(dirname(at(path)), { recursive: true, mode: 0o700 });
    saveFile(at(path), text);
    changed = true;
  }
  const keep = new Set(wanted.map(({ path }) => at(path)));
  const extra: string[] = [];
  for await (const entry of walkMarkdown(root)) if (entry.kind !== "unread" && !keep.has(entry.path)) extra.push(entry.path);
  for (const file of extra) {
    await rm(file, { force: true });
    await removeEmpty(dirname(file), root);
    changed = true;
  }
  return changed;
}

/** Remove `folder`, and each folder above it inside `root`, while it is empty. */
async function removeEmpty(folder: string, root: string): Promise<void> {
  for (let at = folder; isInside(root, at); at = dirname(at)) {
    try {
      await rmdir(at);
    } catch {
      return;
    }
  }
}
