import { join } from "node:path";
import { beforeEach, type TestContext } from "node:test";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";

const given = new WeakMap<TestContext, string>();

/**
 * Give this test a Shrimpy folder of its own, so that nothing it runs reaches
 * a real `~/shrimpy` or the folder the person's own `SHRIMPY_DIR` names. It is
 * a path that does not exist yet, as the default is on a machine that has not
 * set Shrimpy up, and a command that needs it makes it. Programs the test
 * starts inherit it. Asking again in the same test gives the same one, and the
 * setting comes back when the test ends.
 */
export function useShrimpyDir(t: TestContext): string {
  const existing = given.get(t);
  if (existing !== undefined) return existing;
  const folder = join(tempDir(t, "folder"), "shrimpy");
  given.set(t, folder);
  const saved = process.env.SHRIMPY_DIR;
  process.env.SHRIMPY_DIR = folder;
  stopAfter(t, () => {
    if (saved === undefined) delete process.env.SHRIMPY_DIR;
    else process.env.SHRIMPY_DIR = saved;
  });
  return folder;
}

// Every test in a file that imports the CLI's test support has a folder of its own, whether it asks or not,
// and so does each subtest.
beforeEach((t) => {
  if ("test" in t) useShrimpyDir(t);
});
