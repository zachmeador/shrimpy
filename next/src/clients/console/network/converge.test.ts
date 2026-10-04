import assert from "node:assert/strict";
import { test } from "node:test";
import { settle } from "../../../lib/testing/index.ts";
import { converge } from "./converge.ts";

test("a step runs when asked for, and again when it was asked for while it ran, but never beside itself", async () => {
  const log: string[] = [];
  let running = 0;
  let release: () => void = () => undefined;
  const run = converge(
    async () => {
      running += 1;
      log.push(`start with ${String(running)} running`);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      running -= 1;
      log.push("end");
    },
    () => undefined,
  );

  const first = run();
  const second = run();
  const third = run();
  await settle();
  assert.deepEqual(log, ["start with 1 running"]);
  release();
  await settle();
  await settle();
  assert.deepEqual(log, ["start with 1 running", "end", "start with 1 running"]);
  release();
  await Promise.all([first, second, third]);

  assert.deepEqual(log, ["start with 1 running", "end", "start with 1 running", "end"]);
});

test("asked for after a run has ended, it runs again", async () => {
  let runs = 0;
  const run = converge(
    () => {
      runs += 1;
      return Promise.resolve();
    },
    () => undefined,
  );

  await run();
  await run();

  assert.equal(runs, 2);
});

test("a step that fails is reported and ends the run, and the result still settles", async () => {
  const errors: string[] = [];
  let runs = 0;
  const run = converge(
    () => {
      runs += 1;
      return runs === 1 ? Promise.reject(new Error("it broke")) : Promise.resolve();
    },
    (error) => errors.push((error as Error).message),
  );

  await run();
  await run();

  assert.deepEqual(errors, ["it broke"]);
  assert.equal(runs, 2, "and it can be asked for again");
});
