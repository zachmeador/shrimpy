import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { endpointFile } from "../../contracts/agent/index.ts";
import { ConfigError } from "../../lib/json-config/index.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { homePaths, initHome, loadHome, modelLabel, parseModelChoice } from "./index.ts";

const model = { provider: "local", id: "qwen3.8-27b" };

function tempHome(t: TestContext): string {
  return join(tempDir(t, "home"), "scout");
}

test("a home has the layout the plan describes", () => {
  const paths = homePaths("/agents/scout");
  assert.deepEqual(paths, {
    root: "/agents/scout",
    config: "/agents/scout/agent.json",
    soul: "/agents/scout/SOUL.md",
    context: "/agents/scout/context",
    vault: "/agents/scout/vault",
    skills: "/agents/scout/skills",
    auth: "/agents/scout/state/pi/auth.json",
    models: "/agents/scout/state/pi/models.json",
    database: "/agents/scout/state/agent.sqlite",
    runtime: "/agents/scout/runtime",
  });
});

test("the endpoint clients look for is in the folder the home keeps its runtime files in", () => {
  const { runtime } = homePaths("/agents/scout");
  assert.equal(endpointFile("/agents/scout"), join(runtime, "endpoint.json"));
});

test("a relative home becomes an absolute path", () => {
  assert.equal(homePaths("some/home").root, join(process.cwd(), "some/home"));
});

test("init creates every file and folder, and the home loads", (t) => {
  const home = tempHome(t);
  const { paths, created } = initHome(home, { name: "scout", model });

  assert.deepEqual(created, [
    "agent.json",
    "SOUL.md",
    "context",
    "vault",
    "skills",
    "runtime",
    "state/pi",
    "state/pi/models.json",
    "state/pi/auth.json",
  ]);
  assert.deepEqual(JSON.parse(readFileSync(paths.config, "utf8")), { name: "scout", model });
  assert.deepEqual(JSON.parse(readFileSync(paths.models, "utf8")), { providers: {} });
  assert.deepEqual(JSON.parse(readFileSync(paths.auth, "utf8")), {});
  assert.match(readFileSync(paths.soul, "utf8"), /You are scout, a Shrimpy agent/);
  for (const folder of [paths.context, paths.vault, paths.skills, paths.runtime]) {
    assert.ok(statSync(folder).isDirectory(), folder);
  }
  // The storage is created by the agent that owns the home, not by init.
  assert.equal(existsSync(paths.database), false);

  const loaded = loadHome(home);
  assert.equal(loaded.name, "scout");
  assert.deepEqual(loaded.model, model);
  assert.match(loaded.instructions ?? "", /^# SOUL/);
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

test("init does not change an agent that already exists", (t) => {
  const home = tempHome(t);
  initHome(home, { name: "scout", model });
  const before = readFileSync(homePaths(home).config, "utf8");

  assert.throws(
    () => initHome(home, { name: "other", model }),
    /already describes the agent "scout" with the model local\/qwen3\.8-27b\. Init does not change an existing agent/,
  );
  assert.throws(
    () => initHome(home, { name: "scout", model: { provider: "local", id: "other" } }),
    /already describes the agent "scout"/,
  );
  assert.equal(readFileSync(homePaths(home).config, "utf8"), before);
});

test("init refuses a name that cannot be an agent's name, before it writes anything", (t) => {
  const home = tempHome(t);
  for (const name of ["", "..", "-x", "has space", "a/b"]) {
    assert.throws(
      () => initHome(home, { name, model }),
      new Error(
        `The agent name "${name}" must start with a letter or digit and use only letters, digits, dots, hyphens and underscores.`,
      ),
    );
  }
  assert.equal(existsSync(home), false);
});

test("a home without agent.json says how to create one", (t) => {
  const home = tempHome(t);
  assert.throws(
    () => loadHome(home),
    (error: Error) =>
      error.message.includes("is not an agent home") &&
      error.message.includes(`shrimpy agent init ${home} --name <name> --model <provider/id>`),
  );
});

test("agent.json is checked, and an unknown key is an error that names it", (t) => {
  const home = tempHome(t);
  const { paths } = initHome(home, { name: "scout", model });

  writeFileSync(paths.config, JSON.stringify({ name: "scout", model, color: "teal" }));
  assert.throws(
    () => loadHome(home),
    new ConfigError(`${paths.config}: the file has unsupported keys: color. Supported keys: name, model.`),
  );

  writeFileSync(paths.config, JSON.stringify({ name: "scout", model: { provider: "local" } }));
  assert.throws(() => loadHome(home), new ConfigError(`${paths.config}: model.id is required.`));

  writeFileSync(paths.config, JSON.stringify({ model }));
  assert.throws(() => loadHome(home), new ConfigError(`${paths.config}: name is required.`));

  writeFileSync(paths.config, JSON.stringify({ name: "has space", model }));
  assert.throws(
    () => loadHome(home),
    new ConfigError(
      `${paths.config}: name must start with a letter or digit and use only letters, digits, dots, hyphens and underscores.`,
    ),
  );

  writeFileSync(paths.config, "{ not json");
  assert.throws(() => loadHome(home), /agent\.json: not valid JSON/);
});

test("instructions are the text of SOUL.md when it has any", (t) => {
  const home = tempHome(t);
  const { paths } = initHome(home, { name: "scout", model });

  writeFileSync(paths.soul, "Answer in rhyme.\n");
  assert.equal(loadHome(home).instructions, "Answer in rhyme.\n");

  writeFileSync(paths.soul, "  \n");
  assert.equal(loadHome(home).instructions, undefined);

  rmSync(paths.soul);
  assert.equal(loadHome(home).instructions, undefined);
});

test("a model is written provider/id, and the ID may contain slashes", () => {
  assert.deepEqual(parseModelChoice("local/qwen3.8-27b"), model);
  assert.deepEqual(parseModelChoice("openrouter/anthropic/claude-sonnet-4-5"), {
    provider: "openrouter",
    id: "anthropic/claude-sonnet-4-5",
  });
  assert.equal(modelLabel(parseModelChoice("openrouter/anthropic/claude-sonnet-4-5")), "openrouter/anthropic/claude-sonnet-4-5");
  for (const bad of ["", "qwen", "/qwen", "local/"]) {
    assert.throws(() => parseModelChoice(bad), /should be provider\/id, such as anthropic\/claude-sonnet-4-5/, bad);
  }
});
