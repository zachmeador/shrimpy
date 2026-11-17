import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { type Opened, opening } from "../closing/index.ts";

const stacks = new WeakMap<TestContext, Opened>();

/**
 * Stop something the test started once the test ends, even if it failed. Stops
 * run in the reverse order they were registered, so register each one right
 * after starting the thing.
 */
export function stopAfter(t: TestContext, stop: () => void | Promise<void>): void {
  let stack = stacks.get(t);
  if (stack === undefined) {
    const created = opening("A test did not clean up");
    stack = created;
    stacks.set(t, created);
    t.after(() => created.closeAll());
  }
  stack.add(stop);
}

/** A fresh temporary directory, removed with everything in it when the test ends. */
export function tempDir(t: TestContext, name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `shrimpy-${name}-`));
  stopAfter(t, () => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
