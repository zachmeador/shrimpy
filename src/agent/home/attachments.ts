import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { saveFile } from "../../lib/files/node.ts";
import { localTime } from "../../lib/time/index.ts";
import type { HomePaths } from "./layout.ts";

/** Bytes of a file's name in the home: well inside what any file system takes. */
const NAME_BYTES = 200;

/**
 * The files that came with messages, as the home keeps them: in `attachments/`,
 * with a folder for each day a message was sent, each file under the name it
 * was sent with, and a number after it when another file of that day has the
 * name already. What was saved where is kept by attachment ID in
 * `state/attachments.json`, so a file is saved once.
 */
export interface KeptFiles {
  /** Where a file is in the home, relative to it, when it was saved there and is there still. */
  whereIs(id: string): string | undefined;
  /** Save a file that came with a message sent at `sentAt`, and say where it went, relative to the home. */
  keep(file: { id: string; name: string }, sentAt: number, bytes: Uint8Array): string;
}

export function keptFiles(paths: HomePaths): KeptFiles {
  let saved: Record<string, string> | undefined;
  const index = (): Record<string, string> => {
    if (saved !== undefined) return saved;
    try {
      saved = JSON.parse(readFileSync(paths.attachmentsIndex, "utf8")) as Record<string, string>;
    } catch {
      saved = {};
    }
    return saved;
  };
  return {
    whereIs(id) {
      const found = Object.hasOwn(index(), id) ? index()[id] : undefined;
      return found !== undefined && existsSync(join(paths.root, found)) ? found : undefined;
    },
    keep(file, sentAt, bytes) {
      const folder = join(paths.attachments, localTime(sentAt).slice(0, 10));
      mkdirSync(folder, { recursive: true });
      const path = relative(paths.root, saveUnder(folder, fitted(file.name), bytes));
      index()[file.id] = path;
      mkdirSync(paths.state, { recursive: true });
      saveFile(paths.attachmentsIndex, `${JSON.stringify(index(), null, 2)}\n`);
      return path;
    },
  };
}

/**
 * Save `bytes` in `folder` under `name`, or the first of `name-2`, `name-3` and
 * so on that is free, and answer with the file. A file of that name that holds
 * these bytes already, as one saved before a crash does, is the one.
 */
function saveUnder(folder: string, name: string, bytes: Uint8Array): string {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let count = 1; ; count += 1) {
    const file = join(folder, count === 1 ? name : `${stem}-${String(count)}${extension}`);
    try {
      saveFile(file, bytes, { onlyNew: true });
      return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Buffer.from(bytes).equals(readFileSync(file))) return file;
    }
  }
}

/** A name sent with a file, cut to fit a file system, keeping its extension, and never one that hides the file. */
function fitted(name: string): string {
  const shown = name.startsWith(".") ? `_${name}` : name;
  if (Buffer.byteLength(shown) <= NAME_BYTES) return shown;
  const extension = extname(shown).slice(0, 20);
  let stem = shown.slice(0, shown.length - extname(shown).length);
  while (Buffer.byteLength(stem + extension) > NAME_BYTES) stem = stem.slice(0, -1);
  return stem + extension;
}
