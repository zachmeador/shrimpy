import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eventually, stopAfter, tempDir } from "../lib/testing/index.ts";
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

test("SOUL.md, a note and a folder of notes that can't be read are still in what the model is shown, as they were last read, and the new text is shown once they can be read again; a file that is gone is gone, and one that was never read has nothing to show", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const paths = homePaths(home);
  const put = (file: string, text: string): string => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
  const soul = put(paths.soul, "You keep the build green.\n");
  const note = put(join(paths.context, "disk.md"), "The disk is on fire.\n");
  const alex = put(join(paths.context, "people", "alex.md"), "Alex owns the release.\n");
  const gone = put(join(paths.context, "gone.md"), "Deleted soon.\n");
  const never = put(join(paths.context, "never.md"), "Never readable.\n");
  const people = dirname(alex);
  // Put back before the home is removed, which a folder with no permissions would stop.
  stopAfter(t, () => {
    for (const path of [soul, note, never, people]) chmodSync(path, 0o755);
  });
  chmodSync(never, 0o000);
  try {
    readFileSync(never);
    t.skip("this system lets a file with no permissions be read");
    return;
  } catch {
    // It can't be read, as it should not be.
  }
  const model = talking(() => ({ final: "Seen." }));
  const rig = await startAgentRig(t, { home, script: model.script, lookEveryMs: 100 });
  const said = (): string => (rig.reports as Error[]).map((report) => report.message).join("\n");
  /** Say something, and give back the instructions the model had with it. */
  const instructions = async (): Promise<Record<string, string>> => {
    await rig.receiptOn(await rig.say("anything new?"));
    return model.sections.at(-1) ?? {};
  };
  const has = (section: string | undefined, text: string): boolean => section?.includes(text) ?? false;

  let seen = await instructions();
  assert.ok(has(seen.soul, "build green") && has(seen.context, "on fire") && has(seen.context, "Alex owns") && has(seen.context, "Deleted soon"));
  assert.equal(has(seen.context, "Never readable"), false, "a file that could not be read from the start has nothing to show");

  // None of the three can be read now, and the agent says so, and still has them as it last read them.
  chmodSync(soul, 0o000);
  chmodSync(note, 0o000);
  chmodSync(people, 0o000);
  rmSync(gone);
  await eventually(said, (all) => ["SOUL.md", "context/disk.md", "context/people"].every((name) => all.includes(`${name} was left out`)), {
    what: "the files that can't be read to be said",
  });
  seen = await instructions();
  assert.ok(has(seen.soul, "build green"), "SOUL.md is as it was");
  assert.ok(has(seen.context, "The disk is on fire.") && has(seen.context, "Alex owns the release."), "so are the note and the folder of notes");
  assert.equal(has(seen.context, "Deleted soon"), false, "a file that is gone is gone");
  assert.equal(has(seen.context, "Never readable"), false);

  // They can be read again, with new text.
  chmodSync(people, 0o755);
  chmodSync(soul, 0o644);
  chmodSync(note, 0o644);
  put(soul, "You keep the build red.\n");
  put(note, "The disk is out.\n");
  put(alex, "Alex owns nothing.\n");
  seen = await eventually(
    instructions,
    (found) => has(found.soul, "build red") && has(found.context, "The disk is out.") && has(found.context, "owns nothing"),
    { what: "the new text to be shown" },
  );
  assert.equal(has(seen.soul, "build green") || has(seen.context, "on fire") || has(seen.context, "owns the release"), false, "and the old text is gone");
});

test("a skill whose front matter is broken stays listed with the description it had, and its new description is shown once it is right", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const file = join(homePaths(home).skills, "garden", "SKILL.md");
  const write = (text: string): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write("---\ndescription: Use when the person asks about the garden.\n---\nSteps.\n");
  const model = talking(() => ({ final: "Seen." }));
  const rig = await startAgentRig(t, { home, script: model.script, lookEveryMs: 100 });
  /** Say something, and give back the skills the model was told of with it. */
  const skills = async (): Promise<string> => {
    await rig.receiptOn(await rig.say("anything new?"));
    return model.sections.at(-1)?.skills ?? "";
  };
  assert.ok((await skills()).includes("garden: Use when the person asks about the garden."));

  write("# The garden\nNo front matter at all.\n");
  await eventually(() => (rig.reports as Error[]).map((report) => report.message).join("\n"), (all) => all.includes("skills/garden/SKILL.md was left out"), {
    what: "the broken skill to be said",
  });
  assert.ok((await skills()).includes("garden: Use when the person asks about the garden."), "it is listed with the description it had");

  write("---\ndescription: Use when the person asks about the lawn.\n---\nSteps.\n");
  const mended = await eventually(skills, (listed) => listed.includes("garden: Use when the person asks about the lawn."), {
    what: "the new description to be shown",
  });
  assert.ok(!mended.includes("about the garden."), "and the old one is gone");
});
