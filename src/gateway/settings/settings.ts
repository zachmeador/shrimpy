import { unwatchFile, watchFile } from "node:fs";
import { readConfig } from "../../lib/json-config/node.ts";

/** Your settings, as the file has them. A setting the file leaves out stays as it is. */
export interface Settings {
  /** Your name, as every member sees it. */
  readonly name?: string;
}

/** How often the file is looked at for a change. */
const LOOK_MS = 1000;

/** The settings in `file`, or undefined when there is no file. A file that can't be used is an error that says what to fix. */
function readSettings(file: string): Settings | undefined {
  const root = readConfig(file);
  if (root === undefined) return undefined;
  const name = root.optionalString("name");
  root.done();
  return name === undefined ? {} : { name };
}

/**
 * Read the settings in `file` now, and again each time the file changes, and
 * hand each reading to `apply`, or why the file can't be used to `onError`. A
 * file that isn't there, or is taken away, sets nothing. Returns what stops
 * following it.
 */
export function followSettings(file: string, apply: (settings: Settings) => void, onError: (error: Error) => void): () => void {
  const read = (): void => {
    let settings: Settings | undefined;
    try {
      settings = readSettings(file);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    if (settings !== undefined) apply(settings);
  };
  // The file is looked at rather than watched, since a folder shared from another machine tells nothing of a change made there.
  watchFile(file, { interval: LOOK_MS, persistent: false }, read);
  read();
  return () => unwatchFile(file, read);
}
