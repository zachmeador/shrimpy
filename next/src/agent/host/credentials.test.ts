import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCredentials } from "./credentials.ts";

function authFile(content: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), "shrimpy-auth-")), "auth.json");
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

test("keys in auth.json are read by provider", async () => {
  const store = readCredentials(
    authFile({
      anthropic: { type: "api_key", key: "sk-one" },
      cloudflare: { type: "api_key", key: "sk-two", env: { CLOUDFLARE_ACCOUNT_ID: "abc" } },
      codex: { type: "oauth", access: "a", refresh: "r", expires: 99, accountId: "acct" },
    }),
  );

  assert.deepEqual(await store.read("anthropic"), { type: "api_key", key: "sk-one" });
  assert.deepEqual(await store.read("cloudflare"), {
    type: "api_key",
    key: "sk-two",
    env: { CLOUDFLARE_ACCOUNT_ID: "abc" },
  });
  assert.deepEqual(await store.read("codex"), {
    type: "oauth",
    access: "a",
    refresh: "r",
    expires: 99,
    accountId: "acct",
  });
  assert.equal(await store.read("missing"), undefined);
  assert.deepEqual(await store.list(), [
    { providerId: "anthropic", type: "api_key" },
    { providerId: "cloudflare", type: "api_key" },
    { providerId: "codex", type: "oauth" },
  ]);
});

test("a home without an auth.json has no credentials", async () => {
  const store = readCredentials(join(tmpdir(), "shrimpy-no-such-auth.json"));
  assert.deepEqual(await store.list(), []);
});

test("credentials cannot be changed through the store, and the message names the file", async () => {
  const file = authFile({});
  const store = readCredentials(file);
  await assert.rejects(
    async () => store.modify("anthropic", () => Promise.resolve(undefined)),
    new Error(`Credentials can't be changed from here. Edit ${file} instead.`),
  );
  await assert.rejects(async () => store.delete("anthropic"), /Edit .*auth\.json instead/);
});

test("a key is used as written, so a command or variable is refused", () => {
  for (const key of ["!pass show anthropic", "$ANTHROPIC_API_KEY", "${KEY}"]) {
    const file = authFile({ anthropic: { type: "api_key", key } });
    assert.throws(
      () => readCredentials(file),
      (error: Error) =>
        error.message.startsWith(`${file}: anthropic.key is used exactly as written.`) &&
        error.message.includes("put the key itself here"),
      key,
    );
  }
});

test("an entry that does not fit is reported with its provider", () => {
  const cases: [unknown, RegExp][] = [
    [{ anthropic: { key: "k" } }, /anthropic\.type is required/],
    [{ anthropic: { type: "token" } }, /anthropic\.type must be "api_key" or "oauth", not "token"/],
    [{ anthropic: { type: "api_key", key: "k", note: "x" } }, /anthropic has unsupported keys: note\. Supported keys: type, key, env/],
    [{ anthropic: { type: "oauth", access: "a", refresh: "r" } }, /anthropic\.expires is required/],
    [{ anthropic: "k" }, /anthropic must be a JSON object/],
    ["[]", /the file must be a JSON object/],
    ["{ nope", /not valid JSON/],
  ];
  for (const [content, expected] of cases) {
    assert.throws(() => readCredentials(authFile(content)), expected);
  }
});
