import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  declareLocalModel,
  localProvider,
  type ModelServer,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * What agents take from the Shrimpy folder's providers/, through `shrimpy up`
 * and the `agent serve` processes it starts: each is its own process, and
 * nothing here reaches a real provider.
 */

const timeout = 90_000;

/** A test model, closed when the test ends. */
async function testModel(t: TestContext): Promise<ModelServer> {
  const model = await startModelServer();
  t.after(() => model.close());
  return model;
}

const authorizations = (model: ModelServer): (string | undefined)[] =>
  model.requests.map((request) => request.headers.authorization);

test("agents take the model server and key their homes don't hold from the folder's providers/, and a home's own files win", { timeout }, async (t) => {
  const folder = useShrimpyDir(t);
  const shared = await testModel(t);
  const own = await testModel(t);
  for (const name of ["scout", "rex"]) {
    const init = await shrimpy(["agent", "init", name, "--model", "local/test-model"]);
    assert.equal(init.code, 0, init.stderr);
  }
  // The folder has a server and a key for it, for every agent that has none of its own.
  const providers = join(folder, "providers");
  mkdirSync(providers, { recursive: true });
  writeFileSync(
    join(providers, "models.json"),
    JSON.stringify({ providers: { local: localProvider({ url: shared.url, models: ["test-model"] }) } }),
  );
  writeFileSync(join(providers, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "folder-key" } }));
  // scout's home holds nothing. rex has a server and a key of its own.
  const rex = join(folder, "agents", "rex");
  declareLocalModel(rex, { url: own.url, model: "test-model" });
  writeFileSync(join(rex, "state", "pi", "auth.json"), JSON.stringify({ local: { type: "api_key", key: "rex-key" } }));

  await startUp(t, []);
  await untilRegistered("agent", "scout");
  await untilRegistered("agent", "rex");
  for (const name of ["scout", "rex"]) {
    const reply = await shrimpy(["run", name, "hi"]);
    assert.equal(reply.code, 0, reply.stderr);
    assert.equal(reply.stdout, "Hello from the test model.\n");
  }

  assert.deepEqual(authorizations(shared), ["Bearer folder-key"], "scout used the folder's server and key");
  assert.deepEqual(authorizations(own), ["Bearer rex-key"], "and rex its own");
});
