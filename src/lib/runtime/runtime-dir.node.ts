import { createHash } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";

/**
 * The longest Unix socket path in bytes. macOS is the strictest platform, and
 * a path that fits there fits everywhere Shrimpy runs.
 */
export const MAX_SOCKET_PATH_BYTES = 104;

/** Where this user's Shrimpy programs keep their sockets, and what decided it. */
function locate(): { directory: string; setBy: string } {
  const given = process.env.SHRIMPY_RUNTIME_DIR;
  if (given !== undefined) return { directory: given, setBy: "SHRIMPY_RUNTIME_DIR" };
  const xdg = process.env.XDG_RUNTIME_DIR;
  if (xdg) return { directory: join(xdg, "shrimpy"), setBy: "XDG_RUNTIME_DIR" };
  return { directory: join("/tmp", `shrimpy-${String(userInfo().uid)}`), setBy: "the default location" };
}

const OWN = "Shrimpy keeps its sockets only in a directory of its own, so that no other account can stand in for its programs.";
const ELSEWHERE = "set SHRIMPY_RUNTIME_DIR to a directory only you can open";

/**
 * Make `directory` if it isn't there, and refuse it unless it is Shrimpy's
 * own: a directory and not a symbolic link, owned by the account running this,
 * and closed to every other account. Whoever could make it first, or open it,
 * could put a socket there in place of the gateway's.
 */
function makeOwn(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch (error) {
    // Something in the way is said below, as what it is.
    if (lstatSync(directory, { throwIfNoEntry: false }) === undefined) throw error;
  }
  const found = lstatSync(directory);
  if (found.isSymbolicLink()) {
    throw new Error(`The runtime directory ${directory} is a symbolic link. ${OWN} Remove the link, or ${ELSEWHERE}.`);
  }
  if (!found.isDirectory()) {
    throw new Error(`The runtime directory ${directory} is not a directory. ${OWN} Remove what is there, or ${ELSEWHERE}.`);
  }
  if (found.uid !== userInfo().uid) {
    throw new Error(`The runtime directory ${directory} belongs to another account. ${OWN} To use another, ${ELSEWHERE}.`);
  }
  if ((found.mode & 0o077) !== 0) {
    const mode = (found.mode & 0o777).toString(8);
    throw new Error(
      `Other accounts can open the runtime directory ${directory}: its permissions are ${mode}. ${OWN} Make it private with chmod 700, or ${ELSEWHERE}.`,
    );
  }
}

/**
 * Where this user's Shrimpy programs keep their sockets. Unix socket paths
 * are capped near 104 bytes, so sockets can't live deep inside a home.
 * `SHRIMPY_RUNTIME_DIR` overrides the location, for tests and sandboxes. The
 * directory is made if it is missing, and refused if it isn't Shrimpy's own.
 */
export function runtimeDir(): string {
  const { directory } = locate();
  makeOwn(directory);
  return directory;
}

/**
 * The path of a socket called `file` in the runtime directory. A path too long
 * for a socket fails here, saying what to shorten, instead of as an opaque
 * error when something connects or listens, and so does a runtime directory
 * that isn't Shrimpy's own.
 */
function socketIn(file: string): string {
  const { directory, setBy } = locate();
  const path = join(directory, file);
  const bytes = Buffer.byteLength(path);
  if (bytes > MAX_SOCKET_PATH_BYTES) {
    const over = bytes - MAX_SOCKET_PATH_BYTES;
    const remedy =
      setBy === "the default location"
        ? "Set SHRIMPY_RUNTIME_DIR to a directory with a shorter path."
        : `Shorten ${setBy} by at least ${String(over)} bytes, or set SHRIMPY_RUNTIME_DIR to a shorter directory.`;
    throw new Error(
      `The runtime directory ${directory} is too long for a socket: ${path} is ${String(bytes)} bytes, and a Unix socket path holds at most ${String(MAX_SOCKET_PATH_BYTES)}. ${remedy}`,
    );
  }
  makeOwn(directory);
  return path;
}

/**
 * A socket path for the thing identified by `key`, such as a home's path. A
 * `role` gives it another socket, beside the first and named after it.
 */
export function socketPathFor(key: string, role?: string): string {
  const name = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return socketIn(role === undefined ? `${name}.sock` : `${name}-${role}.sock`);
}

/** A socket path with a fixed name, for the one program of its kind on this machine. */
export function namedSocketPath(name: string): string {
  return socketIn(`${name}.sock`);
}
