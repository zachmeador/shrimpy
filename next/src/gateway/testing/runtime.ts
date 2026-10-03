import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

/**
 * Point SHRIMPY_RUNTIME_DIR at a new empty directory for one test, so no two
 * tests share a socket with each other or with anything else on the machine.
 * When the test ends, the directory is removed and the old setting restored.
 */
export function freshRuntime(t: TestContext): string {
  const saved = process.env.SHRIMPY_RUNTIME_DIR;
  const directory = mkdtempSync(join(tmpdir(), "shrimpy-gateway-"));
  process.env.SHRIMPY_RUNTIME_DIR = directory;
  t.after(() => {
    if (saved === undefined) delete process.env.SHRIMPY_RUNTIME_DIR;
    else process.env.SHRIMPY_RUNTIME_DIR = saved;
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
