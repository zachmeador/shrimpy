import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eventually, tempDir } from "../lib/testing/index.ts";
import { LEFT_OUT_BREADCRUMB } from "./following.ts";
import { homePaths } from "./home/index.ts";
import { startAgentRig, talking, writeTrigger } from "./testing/index.ts";

/*
 * An agent looks at its own files and reads again what changed, with nobody telling
 * it to. The real engine is under the agent, the real chat server is beside it, and
 * the model is scripted. A trigger's file is the file these tests change, because
 * the agent keeps the last good definition of a trigger, which shows what it read.
 */

const timeout = 30_000;
/** How often the agent looks at its files here, in milliseconds. */
const LOOK = 250;

test("a file that is still being written is not read until it stops changing; one that can't be used leaves what the agent had, is said once and reaches its sessions as a breadcrumb, which goes when the file is right again", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "tidy", ["every: 1h"], "Tidy the notes.");
  const model = talking(() => ({ final: "Seen." }));
  const rig = await startAgentRig(t, { home, script: model.script, lookEveryMs: LOOK });
  const connection = await rig.connect();
  const file = join(homePaths(home).triggers, "tidy.md");
  const breadcrumb = join(homePaths(home).breadcrumbs, `${LEFT_OUT_BREADCRUMB}.md`);
  /** What the agent has said on standard error. */
  const said = (): Error[] => rig.reports as Error[];
  const everything = async () => (await connection.triggers()).map(({ name, schedule }) => [name, "every" in schedule ? schedule.every : schedule.cron]);
  /** Say something and give back what the model was shown with it. */
  const shownWith = async (text: string): Promise<string> => {
    await rig.receiptOn(await rig.say(text));
    return model.shown.at(-1) ?? "";
  };

  // The file is written a character at a time, faster than the agent looks. At every step it is less than a trigger, and
  // so is an error to read, until the last write completes it.
  const finished = "---\nevery: 2h\n---\nTidy the notes more.\n";
  const unfinished = finished.slice(0, finished.indexOf("Tidy"));
  for (let end = 1; end <= unfinished.length; end += 1) {
    writeFileSync(file, unfinished.slice(0, end));
    await delay(40);
  }
  writeFileSync(file, finished);
  await eventually(everything, (found) => found[0]?.[1] === "2h", { what: "the finished file to be read" });
  assert.deepEqual(said(), [], "nothing of it was read while it was being written");
  assert.equal(existsSync(breadcrumb), false);

  // A file that can't be used: the trigger keeps its last good definition, and the agent says so.
  writeFileSync(file, "---\nevery: soon\n---\nTidy.\n");
  await eventually(() => said().length, (count) => count === 1, { what: "the file to be said" });
  assert.ok(said()[0]?.message.includes("triggers/tidy.md"), "it names the file");
  assert.deepEqual(await everything(), [["tidy", "2h"]], "and the agent has what it had");

  // Another change makes it read everything again, and the same file is not said again.
  writeTrigger(home, "other", ["every: 1h"]);
  await eventually(everything, (found) => found.length === 2, { what: "the other trigger to be read" });
  assert.equal(said().length, 1);

  // The agent's sessions are told in a breadcrumb, once.
  assert.ok(existsSync(breadcrumb));
  const told = await shownWith("anything new?");
  assert.ok(told.includes("triggers/tidy.md"), told);
  assert.ok(!(await shownWith("and now?")).includes("triggers/tidy.md"), "and not again");

  // The file is right: the agent reads it, and the breadcrumb goes.
  writeFileSync(file, "---\nevery: 3h\n---\nTidy.\n");
  await eventually(everything, (found) => found[1]?.[1] === "3h", { what: "the mended file to be read" });
  await eventually(() => existsSync(breadcrumb), (there) => !there, { what: "the breadcrumb to go" });
  assert.ok(!(await shownWith("one more")).includes("triggers/tidy.md"));
  assert.equal(said().length, 1, "and nothing more was said");
});
