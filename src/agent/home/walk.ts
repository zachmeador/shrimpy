import type { Stats } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { isMarkdown } from "../../lib/files/index.ts";
import { listFolder } from "../../lib/files/node.ts";

/** What walking `context/` finds. */
export type ContextEntry =
  /** A Markdown file, or anything else that is not a folder and is named like one, with what it is. */
  | { readonly kind: "markdown"; readonly path: string; readonly info: Stats }
  /** An entry named like a Markdown file that can't be looked at, such as a link to nothing. */
  | { readonly kind: "unseen"; readonly path: string; readonly error: unknown }
  /** A folder that can't be read, such as `context/` in a home that has none. */
  | { readonly kind: "unread"; readonly path: string; readonly error: unknown };

/** An entry of a folder, looked at: what it is, or why that can't be said. */
type Looked = { path: string; info: Stats } | { path: string; error: unknown };

/**
 * The Markdown files under `folder` and the folders under it, in order of name,
 * hidden files and folders skipped and links followed: the files of `context/`
 * that reading the home reads and a look at the home looks at. A folder that was
 * walked already by another path is not walked again, so a link back to one
 * ends, and the folders are walked one after the other, so the same path is the
 * one that is skipped every time.
 */
export function walkContext(folder: string): AsyncGenerator<ContextEntry> {
  return walk(folder, new Set());
}

async function* walk(folder: string, seen: Set<string>): AsyncGenerator<ContextEntry> {
  let names: string[];
  try {
    const real = await realpath(folder);
    if (seen.has(real)) return;
    seen.add(real);
    names = (await listFolder(folder)).map((entry) => entry.name);
  } catch (error) {
    yield { kind: "unread", path: folder, error };
    return;
  }
  const looks = await Promise.all(
    names.map(async (name): Promise<Looked> => {
      const path = join(folder, name);
      try {
        return { path, info: await stat(path) };
      } catch (error) {
        return { path, error };
      }
    }),
  );
  for (const look of looks) {
    if ("info" in look && look.info.isDirectory()) yield* walk(look.path, seen);
    else if (!isMarkdown(look.path)) continue;
    else if ("info" in look) yield { kind: "markdown", path: look.path, info: look.info };
    else yield { kind: "unseen", path: look.path, error: look.error };
  }
}
