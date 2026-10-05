import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { useShrimpyDir } from "../testing/index.ts";
import { homeNamed } from "./index.ts";

test("a bare word is the agent of that name in the Shrimpy folder, and a word with a separator in it or starting with a dot or a tilde is a path", (t) => {
  const home = join(useShrimpyDir(t), "agents", "scout");
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "agent.json"), "{}");

  assert.equal(homeNamed("scout"), home);
  // These are folders of the current directory, or wherever they say, whether or not a home is there.
  assert.equal(homeNamed("./scout"), resolve("scout"));
  assert.equal(homeNamed("../scout"), resolve("../scout"));
  assert.equal(homeNamed("agents/scout"), resolve("agents/scout"));
  assert.equal(homeNamed("/elsewhere/scout"), "/elsewhere/scout");
  assert.equal(homeNamed(".scout"), resolve(".scout"));
  assert.equal(homeNamed("~scout"), resolve("~scout"));
});
