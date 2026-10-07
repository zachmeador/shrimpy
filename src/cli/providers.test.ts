import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { runCli } from "./index.ts";
import {
  captureIo,
  declareLocalModel,
  localProvider,
  type ModelServer,
  serve,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * What agents take from the Shrimpy folder's providers/, through `shrimpy up`
 * and the `agent serve` processes it starts: each is its own process, and
 * nothing here reaches a real provider. And how providers/ is filled, by
 * `providers login` at a terminal that a test answers for.
 */

const timeout = 90_000;

/** A test model, closed when the test ends. */
async function testModel(t: TestContext): Promise<ModelServer> {
  const model = await startModelServer();
  t.after(() => model.close());
  return model;
}

const sent = (model: ModelServer): { model: string; authorization: string | undefined }[] =>
  model.requests.map((request) => ({ model: request.body.model, authorization: request.headers.authorization }));

test("agents take the model, server and key their homes don't hold from the folder's providers/, and a home's own files win", { timeout }, async (t) => {
  const folder = useShrimpyDir(t);
  const shared = await testModel(t);
  const own = await testModel(t);
  // The folder has a model for every agent that names none, a server for it and a key for the server. It has them
  // before it has an agent, as a folder that was signed in first does.
  const providers = join(folder, "providers");
  mkdirSync(providers, { recursive: true });
  writeFileSync(join(providers, "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  writeFileSync(
    join(providers, "models.json"),
    JSON.stringify({ providers: { local: localProvider({ url: shared.url, models: ["test-model"] }) } }),
  );
  writeFileSync(join(providers, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "folder-key" } }));
  // scout names no model, and its home holds nothing. rex names a model, and has a server and a key of its own.
  assert.equal((await shrimpy(["agent", "init", "scout"])).code, 0);
  assert.equal((await shrimpy(["agent", "init", "rex", "--model", "local/other-model"])).code, 0);
  const rex = join(folder, "agents", "rex");
  declareLocalModel(rex, { url: own.url, model: "other-model" });
  writeFileSync(join(rex, "state", "pi", "auth.json"), JSON.stringify({ local: { type: "api_key", key: "rex-key" } }));

  await startUp(t, []);
  await untilRegistered("agent", "scout");
  await untilRegistered("agent", "rex");
  for (const name of ["scout", "rex"]) {
    const reply = await shrimpy(["run", name, "hi"]);
    assert.equal(reply.code, 0, reply.stderr);
    assert.equal(reply.stdout, "Hello from the test model.\n");
  }

  assert.deepEqual(sent(shared), [{ model: "test-model", authorization: "Bearer folder-key" }], "scout used the folder's");
  assert.deepEqual(sent(own), [{ model: "other-model", authorization: "Bearer rex-key" }], "and rex its own");
});

test("providers login signs the folder in with an API key and names a model, and an agent made after it in that folder starts", { timeout }, async (t) => {
  const folder = useShrimpyDir(t);
  const providers = join(folder, "providers");
  const key = "gsk-made-up-for-the-test";
  // The terminal's answers, in order: which provider, its key, and the model agents start with.
  const terminal = captureIo({ answers: ["groq", key, "llama-3.3-70b-versatile"] });

  const code = await runCli(["providers", "login"], terminal.io);

  assert.equal(code, 0, terminal.err.join("\n"));
  assert.deepEqual(JSON.parse(readFileSync(join(providers, "auth.json"), "utf8")), { groq: { type: "api_key", key } });
  assert.equal(statSync(join(providers, "auth.json")).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(join(providers, "default-model.json"), "utf8")), {
    provider: "groq",
    id: "llama-3.3-70b-versatile",
  });
  assert.deepEqual(terminal.asked.map(({ secret }) => secret), [false, true, false], "only the key is asked for unseen");
  assert.ok(!terminal.out.join("\n").includes(key), "and it is printed nowhere");

  // An agent made with no model of its own starts on what the command saved. Starting asks the provider for nothing.
  const init = captureIo();
  assert.equal(await runCli(["agent", "init", "scout"], init.io), 0, init.err.join("\n"));
  const agent = await serve(t, "scout");
  assert.equal(agent.listening.name, "scout");
});
