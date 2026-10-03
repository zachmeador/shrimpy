import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../testing/index.ts";
import { ConfigError, parseConfig } from "./index.ts";
import { readConfig } from "./node.ts";

const file = "/home/a/config.json";

/** The message of the error that `read` throws on `json`. */
function problem(json: string, read: (root: ReturnType<typeof parseConfig>) => void): string {
  try {
    read(parseConfig(json, file));
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message;
  }
  return assert.fail("expected a ConfigError");
}

test("fields are read by name, and absent optional fields are undefined", () => {
  const root = parseConfig(
    '{"name":"scout","debug":true,"limit":3,"model":{"id":"m"},"tags":["a","b"]}',
    file,
  );
  assert.equal(root.string("name"), "scout");
  assert.equal(root.optionalBoolean("debug"), true);
  assert.equal(root.optionalPositiveInteger("limit"), 3);
  assert.equal(root.object("model").string("id"), "m");
  assert.deepEqual(root.optionalChoices("tags", ["a", "b", "c"]), ["a", "b"]);
  assert.equal(root.optionalString("missing"), undefined);
  assert.equal(root.optionalObject("missing"), undefined);
  assert.equal(root.optionalFreeform("missing"), undefined);
  root.done();
});

test("a wrong or missing field is reported with the file and its path", () => {
  const json = '{"model":{"id":3},"providers":{"a":{"models":[{"id":""}]}}}';
  assert.equal(
    problem(json, (root) => root.string("name")),
    `${file}: name is required.`,
  );
  assert.equal(
    problem(json, (root) => root.object("model").string("id")),
    `${file}: model.id must be a non-empty string.`,
  );
  assert.equal(
    problem(json, (root) => {
      const [, provider] = root.object("providers").entries()[0] ?? [];
      provider?.objects("models")[0]?.string("id");
    }),
    `${file}: providers.a.models[0].id must be a non-empty string.`,
  );
});

test("each kind of field names what it expects", () => {
  const json =
    '{"flag":"yes","count":1.5,"cost":-1,"api":"x","kinds":["a","z"],"list":{},"env":{"A":1},"free":[]}';
  const cases: [(root: ReturnType<typeof parseConfig>) => void, string][] = [
    [(root) => root.optionalBoolean("flag"), "flag must be true or false"],
    [(root) => root.optionalPositiveInteger("count"), "count must be a whole number above zero"],
    [(root) => root.number("cost"), "cost must be a number that is zero or more"],
    [(root) => root.choice("api", ["openai", "anthropic"]), 'api must be "openai" or "anthropic", not "x"'],
    [(root) => root.optionalChoices("kinds", ["a", "b"]), 'kinds[1] must be "a" or "b"'],
    [(root) => root.objects("list"), "list must be an array"],
    [(root) => root.optionalStrings("env"), "env.A must be a string"],
    [(root) => root.optionalFreeform("free"), "free must be a JSON object"],
    [(root) => root.object("flag"), "flag must be a JSON object"],
  ];
  for (const [read, expected] of cases) {
    assert.equal(problem(json, read), `${file}: ${expected}.`);
  }
});

test("a key nothing reads is rejected, and the message lists the supported keys", () => {
  assert.equal(
    problem('{"name":"a","extra":1,"more":2}', (root) => {
      root.string("name");
      root.optionalString("model");
      root.done();
    }),
    `${file}: the file has unsupported keys: extra, more. Supported keys: name, model.`,
  );
  assert.equal(
    problem('{"model":{"id":"m","speed":"fast"}}', (root) => {
      const model = root.object("model");
      model.string("id");
      model.done();
    }),
    `${file}: model has unsupported keys: speed. Supported keys: id.`,
  );
});

test("rest() takes the keys that were not read, so done() accepts them", () => {
  const root = parseConfig('{"type":"oauth","access":"a","refresh":"r","accountId":"x"}', file);
  root.string("type");
  root.string("access");
  root.string("refresh");
  assert.deepEqual(root.rest(), { accountId: "x" });
  root.done();
});

test("entries() gives each key with its object, and rejects values that are not objects", () => {
  const root = parseConfig('{"a":{"v":"1"},"b":{"v":"2"}}', file);
  assert.deepEqual(
    root.entries().map(([key, value]) => [key, value.string("v")]),
    [
      ["a", "1"],
      ["b", "2"],
    ],
  );
  root.done();
  assert.equal(
    problem('{"a":"text"}', (config) => config.entries()),
    `${file}: a must be a JSON object.`,
  );
});

test("a caller's own check reports through the same path", () => {
  assert.equal(
    problem('{"model":{"id":"x"}}', (root) => {
      throw root.object("model").problem("id", 'must not be "x"');
    }),
    `${file}: model.id must not be "x".`,
  );
});

test("text that is not a JSON object is reported with the file", () => {
  assert.match(problem("{", () => undefined), /^\/home\/a\/config\.json: not valid JSON \(/);
  assert.equal(
    problem("[]", () => undefined),
    `${file}: the file must be a JSON object.`,
  );
  assert.doesNotThrow(() => parseConfig('\uFEFF{"a":1}', file));
});

test("a file that is missing is undefined, and one that cannot be read is an error", (t) => {
  const dir = tempDir(t, "config");
  assert.equal(readConfig(join(dir, "missing.json")), undefined);

  writeFileSync(join(dir, "ok.json"), '{"a":"b"}');
  assert.equal(readConfig(join(dir, "ok.json"))?.string("a"), "b");

  assert.throws(() => readConfig(dir), /can't be read/);
});
