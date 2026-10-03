import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

type Stop = () => void | Promise<void>;

const stacks = new WeakMap<TestContext, Stop[]>();

/**
 * Stop something the test started once the test ends, even if it failed. Stops
 * run in the reverse order they were registered, so register each one right
 * after starting the thing.
 */
export function stopAfter(t: TestContext, stop: Stop): void {
  let stack = stacks.get(t);
  if (stack === undefined) {
    const created: Stop[] = [];
    stack = created;
    stacks.set(t, created);
    t.after(async () => {
      const errors: unknown[] = [];
      for (const stopOne of created.toReversed()) {
        try {
          await stopOne();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, "A test did not clean up");
    });
  }
  stack.push(stop);
}

/** A fresh temporary directory, removed with everything in it when the test ends. */
export function tempDir(t: TestContext, name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `shrimpy-${name}-`));
  stopAfter(t, () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
