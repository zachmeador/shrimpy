import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";

/**
 * Where this user's Shrimpy programs keep their sockets. Unix socket paths
 * are capped near 104 bytes, so sockets can't live deep inside a home.
 * `SHRIMPY_RUNTIME_DIR` overrides the location, for tests and sandboxes.
 */
export function runtimeDir(): string {
  const directory =
    process.env.SHRIMPY_RUNTIME_DIR ??
    (process.env.XDG_RUNTIME_DIR
      ? join(process.env.XDG_RUNTIME_DIR, "shrimpy")
      : join("/tmp", `shrimpy-${String(userInfo().uid)}`));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/** A socket path for the thing identified by `key`, such as a home's path. */
export function socketPathFor(key: string): string {
  const name = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(runtimeDir(), `${name}.sock`);
}

/** A socket path with a fixed name, for the one program of its kind on this machine. */
export function namedSocketPath(name: string): string {
  return join(runtimeDir(), `${name}.sock`);
}
