import type { WorkspaceFile } from "../../contracts/gateway/index.ts";
import { compare, leftOutSentence, stillHeld, stillKept, takesIn } from "../../lib/files/index.ts";
import { followFiles, lookAtMarkdown, readMarkdown } from "../../lib/files/node.ts";

/** The workspace context, as the gateway hosts it. */
export interface Workspace {
  /** The files as they were last read, in order of path. */
  files(): WorkspaceFile[];
  /** Stop looking at the files. */
  close(): Promise<void>;
}

/**
 * Host the Markdown files under `folder`, the Shrimpy folder's `context/`, as
 * the workspace context: read now, and again whenever a look finds them
 * changed, as an agent reads its own home. `onChange` is told after each
 * reading that changed them. Each file is named by its full path, which is how
 * agents are shown it. A folder that isn't there has no files. A file or
 * folder that can't be read is said once on `onError`, and keeps what was last
 * read of it, so a save that is broken for a moment takes
 * nothing out of any agent's instructions.
 */
export async function hostWorkspace(folder: string, options: { onChange(): void; onError(error: Error): void }): Promise<Workspace> {
  let files: WorkspaceFile[] = [];
  let said = new Set<string>();
  const following = followFiles({
    async look() {
      const found = new Map<string, string>();
      await lookAtMarkdown(folder, found);
      return JSON.stringify([...found]);
    },
    async read() {
      const read = await readMarkdown(folder, { named: (path) => path });
      const kept = stillHeld(files, read.files, read.leftOut);
      const isKept = (left: string): boolean => kept.some(({ path }) => takesIn(left, path));
      const sentences = read.leftOut.map((left) => leftOutSentence(isKept(left.file) ? stillKept(left) : left));
      for (const sentence of sentences) if (!said.has(sentence)) options.onError(new Error(sentence));
      said = new Set(sentences);
      const next = [...read.files, ...kept].sort((a, b) => compare(a.path, b.path));
      if (JSON.stringify(next) === JSON.stringify(files)) return;
      files = next;
      options.onChange();
    },
    onError: (error) => options.onError(error),
  });
  await following.reload();
  return { files: () => files, close: () => following.close() };
}
