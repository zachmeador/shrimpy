import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { homePaths } from "./layout.ts";
import { lookAtHome } from "./look.ts";

/*
 * The agent reads its home again when a look at it shows a change. So a look has to
 * show a change to every file that reading the home reads, and none to the rest.
 */

test("a look changes when a file that reading the home reads is changed, made, deleted or made unreadable, and not for any other file of the home", async (t) => {
  const paths = homePaths(join(tempDir(t, "look"), "scout"));
  const outside = join(tempDir(t, "folder"), "models.json");
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const inHome = (name: string): string => join(paths.root, name);
  const look = (): Promise<string> => lookAtHome(paths, [outside]);

  const read = ["agent.json", "SOUL.md", "wake.json", "context/user.md", "context/people/alex.md", "skills/review/SKILL.md", "triggers/nightly.md"];
  for (const name of read) write(inHome(name), "one");
  write(outside, "one");
  // A link is followed to the file it names.
  write(inHome("elsewhere/linked.md"), "one");
  symlinkSync(inHome("elsewhere/linked.md"), inHome("context/linked.md"));
  const files = [...read.map(inHome), outside, inHome("elsewhere/linked.md")];

  let last = await look();
  assert.equal(await look(), last, "a home nothing happened to looks the same");
  assert.ok(last.includes("shrimpy-agents/SKILL.md"), "the skills that ship with Shrimpy are looked at too");
  for (const file of files) {
    write(file, "changed, and longer");
    const next = await look();
    assert.notEqual(next, last, `${file} was changed`);
    last = next;
  }
  // A file that is made unreadable, or readable again, changes neither its size nor its time.
  for (const file of files) {
    chmodSync(file, 0o000);
    const shut = await look();
    assert.notEqual(shut, last, `${file} was made unreadable`);
    chmodSync(file, 0o644);
    last = await look();
    assert.notEqual(last, shut, `${file} was made readable again`);
  }
  for (const file of [inHome("context/new.md"), inHome("triggers/new.md"), inHome("skills/new/SKILL.md")]) {
    write(file, "one");
    const next = await look();
    assert.notEqual(next, last, `${file} was made`);
    last = next;
    rmSync(file);
    assert.notEqual(await look(), last, `${file} was deleted`);
    last = await look();
  }

  // What reading the home does not read: the rest of the home, and files in the folders it reads that are not its kind.
  const others = [
    "vault/notes.md",
    "breadcrumbs/build.md",
    "state/pi/auth.json",
    "state/agent.sqlite",
    "runtime/owner.lock",
    "context/.hidden.md",
    "context/data.json",
    "triggers/notes.txt",
    "triggers/.draft.md",
    "skills/review/notes.md",
    "skills/.hidden/SKILL.md",
  ];
  for (const name of others) write(inHome(name), "one");
  assert.equal(await look(), last, "made");
  for (const name of others) write(inHome(name), "something else, and longer");
  assert.equal(await look(), last, "changed");
});
