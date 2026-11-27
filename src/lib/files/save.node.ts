import { closeSync, fchmodSync, fsyncSync, linkSync, openSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface SaveOptions {
  /** The mode the file is kept with. Without one, a file that is there keeps its own, and a new one gets what any new file gets. */
  readonly mode?: number;
  /** Make the file only if it isn't there: one that is stays as it is, and the save fails with `EEXIST`. */
  readonly onlyNew?: boolean;
}

/**
 * Save `content`, text or bytes, as `file`, whole, so that whoever reads it sees the old file or
 * the new one and never half of either, after a crash too. It is written to a
 * hidden file beside it, with the mode the file is to have, flushed to disk and
 * renamed over the old one, and then the folder is flushed, so that a power
 * cut after this returns keeps the new file. The folder must be there.
 */
export function saveFile(file: string, content: string | Uint8Array, options: SaveOptions = {}): void {
  const folder = dirname(file);
  // Hidden, so that whatever reads the folder's files, such as an agent its triggers, passes it by.
  const temporary = join(folder, `.${basename(file)}.${String(process.pid)}.tmp`);
  const mode = options.mode ?? modeOf(file);
  try {
    const descriptor = openSync(temporary, "w", mode ?? 0o666);
    try {
      // Exactly the mode, which the umask would otherwise cut down.
      if (mode !== undefined) fchmodSync(descriptor, mode);
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (options.onlyNew === true) linkSync(temporary, file);
    else renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  flushFolder(folder);
}

/** The mode of `file`, or undefined when there is none. */
function modeOf(file: string): number | undefined {
  const found = statSync(file, { throwIfNoEntry: false });
  return found === undefined ? undefined : found.mode & 0o777;
}

/**
 * Flush the folder, so that the rename lasts through a power cut. Some file
 * systems can't open or flush a folder; there the file is whole all the same,
 * and only a power cut at once could bring back the old one, so it is no
 * failure of the save.
 */
function flushFolder(folder: string): void {
  try {
    const descriptor = openSync(folder, "r");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return;
  }
}
