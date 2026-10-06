import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ConfigError } from "../../lib/json-config/index.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { homePaths, initHome, loadHome, parseModelChoice } from "./index.ts";

const model = { provider: "local", id: "qwen3.8-27b" };

function tempHome(t: TestContext): string {
  return join(tempDir(t, "home"), "scout");
}

test("init creates every file and folder, and the home loads", (t) => {
  const home = tempHome(t);
  const { paths } = initHome(home, { name: "scout", model });

  assert.deepEqual(JSON.parse(readFileSync(paths.config, "utf8")), { name: "scout", model });
  assert.deepEqual(JSON.parse(readFileSync(paths.models, "utf8")), { providers: {} });
  assert.deepEqual(JSON.parse(readFileSync(paths.auth, "utf8")), {});
  assert.match(readFileSync(paths.soul, "utf8"), /🦐/, "the starter SOUL.md says the agent enjoys the shrimp emoji");
  for (const folder of [paths.context, paths.vault, paths.skills, paths.breadcrumbs, paths.runtime]) {
    assert.ok(statSync(folder).isDirectory(), folder);
  }
  // The storage is created by the agent that owns the home, not by init.
  assert.equal(existsSync(paths.database), false);

  const loaded = loadHome(home);
  assert.equal(loaded.name, "scout");
  assert.deepEqual(loaded.model, model);
  assert.deepEqual(loaded.paths, paths);
});

test("the credential file is private to its owner", { skip: process.platform === "win32" }, (t) => {
  const { paths } = initHome(tempHome(t), { name: "scout", model });
  assert.equal(statSync(paths.auth).mode & 0o777, 0o600);
});

test("init again changes nothing, and only fills in what is missing", (t) => {
  const home = tempHome(t);
  const { paths } = initHome(home, { name: "scout", model });
  writeFileSync(paths.soul, "Be brief.\n");
  writeFileSync(paths.models, '{"providers":{"local":{}}}\n');

  assert.deepEqual(initHome(home, { name: "scout", model }).created, []);
  assert.equal(readFileSync(paths.soul, "utf8"), "Be brief.\n");
  assert.equal(readFileSync(paths.models, "utf8"), '{"providers":{"local":{}}}\n');

  rmSync(paths.vault, { recursive: true });
  rmSync(paths.auth);
  assert.deepEqual(initHome(home, { name: "scout", model }).created, ["vault", "state/pi/auth.json"]);
  assert.equal(readFileSync(paths.soul, "utf8"), "Be brief.\n");
});

test("init does not change an agent that already exists, and refuses a name that cannot be one before it writes anything", (t) => {
  const home = tempHome(t);
  initHome(home, { name: "scout", model });
  const before = readFileSync(homePaths(home).config, "utf8");

  assert.throws(() => initHome(home, { name: "other", model }), /already describes the agent "scout"/);
  assert.equal(readFileSync(homePaths(home).config, "utf8"), before);

  const fresh = tempHome(t);
  assert.throws(() => initHome(fresh, { name: "has space", model }), /must start with a letter or digit/);
  assert.equal(existsSync(fresh), false);
});

test("agent.json is checked, and a bad value is refused with the file and the key that is wrong", (t) => {
  const home = tempHome(t);
  const { paths } = initHome(home, { name: "scout", model });
  const refusedFor = (key: string) => (error: Error) =>
    error instanceof ConfigError && error.message.includes(paths.config) && error.message.includes(key);

  writeFileSync(paths.config, JSON.stringify({ name: "scout", model, color: "teal" }));
  assert.throws(() => loadHome(home), refusedFor("color"));

  writeFileSync(paths.config, JSON.stringify({ name: "scout", model: { provider: "local" } }));
  assert.throws(() => loadHome(home), refusedFor("model.id"));
});

test("a model is written provider/id, and the ID may contain slashes", () => {
  assert.deepEqual(parseModelChoice("local/qwen3.8-27b"), model);
  assert.deepEqual(parseModelChoice("openrouter/anthropic/claude-sonnet-4-5"), {
    provider: "openrouter",
    id: "anthropic/claude-sonnet-4-5",
  });
  for (const bad of ["qwen", "/qwen", "local/"]) assert.throws(() => parseModelChoice(bad), /should be provider\/id/, bad);
});
