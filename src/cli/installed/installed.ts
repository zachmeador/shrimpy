import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Lock, LockHeldError, takeLock } from "../../lib/lock/node.ts";

/** The folder this Shrimpy's files are in, with any link in its path followed: a version's folder, or a checkout. */
export const SHRIMPY_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** A release's version as the install script takes it, which names the version's folder. */
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/** Whether `version` is a release's version, such as `1.0.0`. */
export const isVersion = (version: string): boolean => VERSION.test(version);

/** The command that removes everything the install script put in an account. The Shrimpy folder is left. */
export const REMOVE_INSTALL = "rm -rf ~/.local/share/shrimpy/versions ~/.local/share/shrimpy/node ~/.local/bin/shrimpy";

/** The install script's folders under one account's home, and the version there that runs this command. */
export interface Installed {
  /** A folder for each version, with its files and its node_modules. */
  readonly versions: string;
  /** A folder for each Node a version runs on. */
  readonly nodes: string;
  /** The version that runs this command. */
  readonly version: string;
}

/** The install script's folders under `home`, with `version` running this command. */
export function installedIn(home: string, version: string): Installed {
  const share = join(home, ".local", "share", "shrimpy");
  return { versions: join(share, "versions"), nodes: join(share, "node"), version };
}

/** The install this Shrimpy runs from, or undefined when it runs from anywhere else, such as a checkout. */
export function thisInstall(): Installed | undefined {
  const installed = installedIn(homedir(), basename(SHRIMPY_ROOT));
  return existsSync(installed.versions) && dirname(SHRIMPY_ROOT) === realpathSync(installed.versions) ? installed : undefined;
}

/** The versions installed. */
function versionsIn(installed: Installed): string[] {
  return existsSync(installed.versions) ? readdirSync(installed.versions).filter(isVersion) : [];
}

/** The Node that `version` runs on, as its `.node-version` names it, or undefined when it names none. */
function nodeOf(installed: Installed, version: string): string | undefined {
  try {
    return readFileSync(join(installed.versions, version, ".node-version"), "utf8").replace(/[\sv]/g, "");
  } catch {
    return undefined;
  }
}

/** The command that runs `version`: its own Node, and its entry point. */
export function commandOf(installed: Installed, version: string): string[] {
  const node = nodeOf(installed, version);
  if (node === undefined) throw new Error(`Shrimpy ${version}, in ${join(installed.versions, version)}, names no Node to run on.`);
  return [join(installed.nodes, node, "bin", "node"), join(installed.versions, version, "bin", "shrimpy.js")];
}

/** The installed versions that one of `paths` lies in, such as the Node and the entry point that a service runs. */
export function versionsHolding(installed: Installed, paths: readonly string[]): string[] {
  if (!existsSync(installed.versions)) return [];
  // A path that was found by following a link, as Node finds its entry point, starts with the real folder.
  const folders = [installed.versions, realpathSync(installed.versions)];
  return versionsIn(installed).filter((version) =>
    folders.some((folder) => paths.some((path) => path.startsWith(join(folder, version) + sep))),
  );
}

/**
 * Hold the install for one update at a time: its install script, its removals and its restart. Several agents of a
 * machine may each start an update at once, and two install scripts at once break each other.
 */
export function takeInstallLock(installed: Installed): Lock {
  const words = "Another shrimpy update is running in this account, so this one changed nothing. Run it again once that one has ended, if it is still needed.";
  return takeLock(join(installed.versions, ".update.lock"), (cause) => new LockHeldError(words, { cause }));
}

/** Remove every version but those in `keep`, then every Node that no version left runs on, and say what went. */
export function removeAllBut(installed: Installed, keep: ReadonlySet<string>): { versions: string[]; nodes: string[] } {
  const versions = versionsIn(installed).filter((version) => !keep.has(version));
  for (const version of versions) rmSync(join(installed.versions, version), { recursive: true, force: true });
  const used = versionsIn(installed).map((version) => nodeOf(installed, version));
  // A version that names no Node may run on any of them.
  if (used.includes(undefined) || !existsSync(installed.nodes)) return { versions, nodes: [] };
  const nodes = readdirSync(installed.nodes).filter((node) => !node.startsWith(".") && !used.includes(node));
  for (const node of nodes) rmSync(join(installed.nodes, node), { recursive: true, force: true });
  return { versions, nodes };
}
