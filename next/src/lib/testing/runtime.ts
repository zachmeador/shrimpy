import type { TestContext } from "node:test";
import { stopAfter, tempDir } from "./cleanup.ts";

const given = new WeakMap<TestContext, string>();

/**
 * Give this test a runtime directory of its own, so the sockets of its servers
 * never meet another test's, or anything else on the machine. Its name is short
 * because a socket's whole path must fit in about a hundred bytes. Programs the
 * test starts inherit it. Asking again in the same test gives the same one.
 */
export function useRuntimeDir(t: TestContext): string {
  const existing = given.get(t);
  if (existing !== undefined) return existing;
  const directory = tempDir(t, "rt");
  given.set(t, directory);
  const saved = process.env.SHRIMPY_RUNTIME_DIR;
  process.env.SHRIMPY_RUNTIME_DIR = directory;
  stopAfter(t, () => {
    if (saved === undefined) delete process.env.SHRIMPY_RUNTIME_DIR;
    else process.env.SHRIMPY_RUNTIME_DIR = saved;
  });
  return directory;
}
