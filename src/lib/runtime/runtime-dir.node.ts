import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
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

/**
 * Where this user's Shrimpy programs keep their sockets. Unix socket paths
 * are capped near 104 bytes, so sockets can't live deep inside a home.
 * `SHRIMPY_RUNTIME_DIR` overrides the location, for tests and sandboxes.
 */
export function runtimeDir(): string {
  const { directory } = locate();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/**
 * The path of a socket called `file` in the runtime directory. A path too long
 * for a socket fails here, saying what to shorten, instead of as an opaque
 * error when something connects or listens.
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
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return path;
}

/** A socket path for the thing identified by `key`, such as a home's path. */
export function socketPathFor(key: string): string {
  const name = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return socketIn(`${name}.sock`);
}

/** A socket path with a fixed name, for the one program of its kind on this machine. */
export function namedSocketPath(name: string): string {
  return socketIn(`${name}.sock`);
}
