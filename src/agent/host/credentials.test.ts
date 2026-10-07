import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createModels, createProvider, type OAuthCredential } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { startChild, tempDir, within } from "../../lib/testing/index.ts";
import { credentialStore } from "./credentials.ts";

const credentialsModule = new URL("./credentials.ts", import.meta.url).href;

const HOUR_MS = 60 * 60 * 1000;

/** A subscription sign-in with a field of its own, as providers keep one. */
function signIn(options: { access: string; refresh: string; expiresIn: number }): OAuthCredential {
  const { access, refresh, expiresIn } = options;
  return { type: "oauth", access, refresh, expires: Date.now() + expiresIn, accountId: "acct-1" };
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

test("a key is used as written, so a command or a variable in its place is refused", async (t) => {
  for (const key of ["!pass show anthropic", "$ANTHROPIC_API_KEY"]) {
    const file = join(tempDir(t, "auth"), "auth.json");
    writeFileSync(file, JSON.stringify({ anthropic: { type: "api_key", key } }));
    await assert.rejects(
      credentialStore(file).read("anthropic"),
      (error: Error) => error.message.includes(file) && error.message.includes("anthropic.key"),
      key,
    );
  }
});

test("agents that share a sign-in renew it once, and each then uses the new token", async (t) => {
  const file = join(tempDir(t, "shared"), "auth.json");
  const other = { type: "api_key", key: "sk-other" };
  writeFileSync(file, JSON.stringify({ other, sub: signIn({ access: "access-0", refresh: "refresh-0", expiresIn: 60_000 }) }));

  let renewals = 0;
  const provider = createProvider({
    id: "sub",
    auth: {
      oauth: {
        name: "A subscription",
        login: () => Promise.reject(new Error("Nothing signs in here.")),
        async refresh(credential) {
          renewals += 1;
          const number = renewals;
          // The request to the provider takes a moment, and the other agent asks while it is made.
          await delay(150);
          return { ...credential, access: `access-${number}`, refresh: `refresh-${number}`, expires: Date.now() + HOUR_MS };
        },
        toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
      },
    },
    models: [
      {
        id: "m",
        name: "m",
        api: "openai-completions",
        provider: "sub",
        baseUrl: "http://models.invalid/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000,
        maxTokens: 100,
      },
    ],
    api: openAICompletionsApi(),
  });
  // Two stores over one file stand in for two agents, each with models of its own.
  const agents = [credentialStore(file), credentialStore(file)].map((credentials) => {
    const models = createModels({ credentials });
    models.setProvider(provider);
    return models;
  });

  const [first, second] = await Promise.all(agents.map((models) => models.getAuth("sub")));

  assert.equal(renewals, 1);
  assert.equal(first?.auth.apiKey, "access-1");
  assert.equal(second?.auth.apiKey, "access-1");
  const stored = readJson(file) as { other: unknown; sub: OAuthCredential };
  assert.deepEqual(stored.other, other, "the other entries are as they were");
  assert.equal(stored.sub.refresh, "refresh-1", "the file holds the rotated sign-in");
  assert.equal(stored.sub.accountId, "acct-1", "with the fields it came with");
  // A sign-in that is still good is not renewed again.
  assert.equal((await agents[0]?.getAuth("sub"))?.auth.apiKey, "access-1");
  assert.equal(renewals, 1);
});

test("the home's file comes first, a change goes to the file that holds the entry, and a file is written whole and privately", async (t) => {
  const root = tempDir(t, "files");
  const homeFile = join(root, "home", "state", "pi", "auth.json");
  const folderFile = join(root, "folder", "providers", "auth.json");
  mkdirSync(dirname(homeFile), { recursive: true });
  const own = {
    mine: { type: "api_key", key: "sk-mine" },
    both: { type: "api_key", key: "sk-home" },
  };
  writeFileSync(homeFile, JSON.stringify(own));
  const store = credentialStore(homeFile, { file: folderFile, except: new Set() });

  assert.deepEqual(await store.read("sub"), undefined, "a folder with no providers/ in it holds nothing, and that is no error");

  // A sign-in made in the folder, which has no providers/ yet.
  const signedIn = signIn({ access: "access-1", refresh: "refresh-1", expiresIn: HOUR_MS });
  await credentialStore(folderFile).modify("sub", () => Promise.resolve(signedIn));
  await credentialStore(folderFile).modify("both", () => Promise.resolve({ type: "api_key", key: "sk-folder" }));
  assert.equal(statSync(dirname(folderFile)).mode & 0o777, 0o700);
  assert.equal(statSync(folderFile).mode & 0o777, 0o600);

  assert.deepEqual(await store.read("sub"), signedIn);
  assert.deepEqual(await store.read("both"), own.both, "the home's own entry wins");
  assert.deepEqual((await store.list()).map(({ providerId }) => providerId).sort(), ["both", "mine", "sub"]);

  // A renewal goes to the folder's file, where the sign-in is, and leaves that file's other entry as it was.
  const renewed = { ...signedIn, access: "access-2", refresh: "refresh-2" };
  const result = await store.modify("sub", (current) => {
    assert.deepEqual(current, signedIn);
    return Promise.resolve(renewed);
  });
  assert.deepEqual(result, renewed);
  assert.deepEqual(readJson(folderFile), { sub: renewed, both: { type: "api_key", key: "sk-folder" } });
  assert.deepEqual(readJson(homeFile), own, "and the home's file is not touched");

  // Taking an entry away goes to the file that holds it too, and what it hid shows again.
  await store.delete("both");
  assert.deepEqual(readJson(homeFile), { mine: own.mine });
  assert.deepEqual(await store.read("both"), { type: "api_key", key: "sk-folder" });
});

test("a change waits for the process that holds a file, gives up when told to, and goes through once that process is gone, whatever ended it", async (t) => {
  const file = join(tempDir(t, "held"), "auth.json");
  const before = signIn({ access: "access-1", refresh: "refresh-1", expiresIn: 60_000 });
  writeFileSync(file, JSON.stringify({ sub: before }));
  // Another process is renewing, and never finishes.
  const source = `
    import { credentialStore } from ${JSON.stringify(credentialsModule)};
    credentialStore(${JSON.stringify(file)}).modify("sub", async () => {
      console.log(JSON.stringify({ event: "renewing" }));
      await new Promise(() => {});
    });
    setInterval(() => {}, 1000);
  `;
  const renewing = await startChild(t, { source });
  const store = credentialStore(file);

  const stop = new AbortController();
  void delay(200).then(() => stop.abort());
  await assert.rejects(
    within(5_000, store.modify("sub", () => Promise.resolve(undefined), { signal: stop.signal }), "giving up"),
    { name: "AbortError" },
  );

  let done = false;
  const next = store.modify("sub", (current) => Promise.resolve({ ...(current as OAuthCredential), access: "access-2" }));
  void next.then(() => (done = true));
  await delay(300);
  assert.equal(done, false, "it is still waiting");
  assert.deepEqual(readJson(file), { sub: before }, "and the file is as the renewal found it");

  await renewing.kill("SIGKILL");
  await within(10_000, next, "the change to go through");
  assert.equal((readJson(file) as { sub: OAuthCredential }).sub.access, "access-2");
});
