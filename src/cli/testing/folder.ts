import { chmodSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
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

/**
 * Give this test an empty home directory of its own, so that a command which looks in the account's home, for the
 * service that keeps Shrimpy running among other things, finds nothing there and never the person's own. Programs
 * the test starts inherit it, and the setting comes back when the test ends.
 */
function useHome(t: TestContext): void {
  const saved = process.env.HOME;
  process.env.HOME = tempDir(t, "home");
  stopAfter(t, () => {
    if (saved === undefined) delete process.env.HOME;
    else process.env.HOME = saved;
  });
}

/**
 * Put programs that stand for the machine's service manager first on the PATH of this test, so that a command which
 * runs `systemctl`, `loginctl` or `launchctl` by name, as the one that installs a service does, reaches one that
 * fails and says why, and never the real one. A test that wants a service installed hands the command a stand-in
 * for the service manager instead. Programs the test starts inherit this, and the PATH comes back when it ends.
 */
function useNoServiceManager(t: TestContext): void {
  const bin = tempDir(t, "no-service-manager");
  for (const name of ["systemctl", "loginctl", "launchctl"]) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\necho "${name} was run by a test. Hand the command a stand-in for the service manager." >&2\nexit 99\n`);
    chmodSync(file, 0o755);
  }
  const saved = process.env.PATH;
  process.env.PATH = saved === undefined || saved === "" ? bin : `${bin}${delimiter}${saved}`;
  stopAfter(t, () => {
    if (saved === undefined) delete process.env.PATH;
    else process.env.PATH = saved;
  });
}

// Every test in a file that imports the CLI's test support has a folder and a home of its own, and no way to reach
// the machine's service manager, whether it asks or not, and so does each subtest.
beforeEach((t) => {
  if ("test" in t) {
    useShrimpyDir(t);
    useHome(t);
    useNoServiceManager(t);
  }
});
