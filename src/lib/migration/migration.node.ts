import { readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { listed } from "../text/index.ts";
import { SHRIMPY_VERSION } from "../version/index.ts";

/** A change to a store's format: the version it brings a store to, from the version before. */
export interface Step {
  readonly version: number;
}

/**
 * A store's format as one release has it: the version it writes, the oldest it
 * migrates from, and the steps between. The first change to the format after a
 * release raises the version by one and adds the step to it, and later changes
 * before the next release edit that step. `oldest` is the store's version at the
 * previous major's first release, so a store from this major or the one before
 * migrates, and a major raises it and removes the steps from before it. Until
 * 1.0.0 stores change in place, and `oldest` is the current version.
 */
export interface StoreFormat<S extends Step> {
  readonly current: number;
  readonly oldest: number;
  /** Oldest first, each to the version after the one before it, the last to `current`. */
  readonly steps: readonly S[];
}

export interface StoreAtStart<S extends Step> {
  readonly file: string;
  /** Files that go with the store when it is moved, if they are beside it, such as SQLite's log. */
  readonly beside?: readonly string[];
  /** What the store is, to start a sentence: "The chat store in /srv/shrimpy/chat". */
  readonly what: string;
  /** The program that opens it, to be started again: "the chat server". */
  readonly program: string;
  /** What starting over without the store loses. */
  readonly startingOver: string;
  /** The version the store was written at, or undefined when there is no store yet. */
  readonly found: number | undefined;
  readonly format: StoreFormat<S>;
}

/**
 * Decide what to do with a store before opening it, and give the steps that
 * bring it up to date, oldest first. With none, it opens as it is. With some,
 * `copy` has copied the store to the path it was given, the copy has its name,
 * and the copy from the migration before is gone. A store that a newer release
 * wrote is refused, naming the copy to put back, and so is one too old to
 * migrate.
 */
export function beforeOpening<S extends Step>(store: StoreAtStart<S>, copy: (to: string) => void): readonly S[] {
  const { found, format } = store;
  if (found === undefined || found === format.current) return [];
  if (found > format.current) throw new Error(newer(store));
  if (found < format.oldest) throw new Error(tooOld(store));
  const steps = format.steps.filter((step) => step.version > found);
  for (let version = found + 1; version <= format.current; version++) {
    if (steps[version - found - 1]?.version !== version) throw new Error(`${store.what} has no step to version ${version}.`);
  }
  const to = migrationCopy(store.file);
  const part = `${to}.part`;
  rmSync(part, { force: true });
  copy(part);
  renameSync(part, to);
  for (const earlier of copies(store.file)) if (earlier !== to) rmSync(earlier, { force: true });
  return steps;
}

/** Where this release copies `file` before migrating it: `chat.sqlite` goes to `chat.before-1.1.0.sqlite`. */
export function migrationCopy(file: string): string {
  const { stem, extension } = parts(file);
  return join(dirname(file), `${stem}.before-${SHRIMPY_VERSION}${extension}`);
}

/** The copies of `file` beside it, whichever release made them. */
function copies(file: string): string[] {
  const { stem, extension } = parts(file);
  const directory = dirname(file);
  return readdirSync(directory)
    .filter((name) => name.startsWith(`${stem}.before-`) && name.endsWith(extension))
    .sort()
    .map((name) => join(directory, name));
}

function parts(file: string): { stem: string; extension: string } {
  const extension = extname(file);
  return { stem: basename(file, extension), extension };
}

/** The store's file, and what goes with it, to be moved into an archive folder. */
function moving(store: StoreAtStart<Step>): string {
  const beside = store.beside?.map((file) => basename(file)) ?? [];
  return beside.length === 0 ? store.file : `${store.file}, with ${listed(beside)} if they are beside it,`;
}

function newer(store: StoreAtStart<Step>): string {
  const said = `${store.what} was written by a newer release of Shrimpy, and this one, ${SHRIMPY_VERSION}, can't open it. Update Shrimpy here to open it.`;
  const copy = copies(store.file).at(-1);
  if (copy === undefined) return `${said} There is no copy beside it from before that release changed it.`;
  return (
    `${said} Or, to stay on this release, put back the copy made before that release changed it: ` +
    `move ${moving(store)} into an archive folder, rename ${copy} to ${basename(store.file)}, and start ${store.program} again. ` +
    "What changed since the copy stays with the newer store."
  );
}

function tooOld(store: StoreAtStart<Step>): string {
  return (
    `${store.what} was written by a release of Shrimpy too old for this one, ${SHRIMPY_VERSION}, to migrate, and nothing converts it. ` +
    `Move ${moving(store)} into an archive folder, and start ${store.program} again. ${store.startingOver}`
  );
}
