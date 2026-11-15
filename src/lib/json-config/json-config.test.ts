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

test("a wrong or missing field is reported with the file and its path", () => {
  const json = '{"model":{"id":3},"providers":{"a":{"models":[{"id":""}]}}}';
  const cases: [string, (root: ReturnType<typeof parseConfig>) => void][] = [
    ["name", (root) => root.string("name")],
    ["model.id", (root) => root.object("model").string("id")],
    [
      "providers.a.models[0].id",
      (root) => {
        const [, provider] = root.object("providers").entries()[0] ?? [];
        provider?.objects("models")[0]?.string("id");
      },
    ],
  ];
  for (const [path, read] of cases) {
    const said = problem(json, read);
    assert.ok(said.startsWith(`${file}: ${path} `), said);
  }
});

test("a key nothing reads is rejected, and the message names it and the supported keys", () => {
  const said = problem('{"name":"a","extra":1,"more":2}', (root) => {
    root.string("name");
    root.optionalString("model");
    root.done();
  });
  assert.ok(said.startsWith(`${file}: `), said);
  for (const key of ["extra", "more", "name", "model"]) assert.ok(said.includes(key), key);
});

test("text that is not a JSON object is reported with the file, and a byte-order mark is not a problem", () => {
  for (const text of ["{", "[]"]) assert.ok(problem(text, () => undefined).startsWith(`${file}: `), text);
  assert.doesNotThrow(() => parseConfig('﻿{"a":1}', file));
});

test("a file that is missing is undefined, and one that cannot be read is an error", (t) => {
  const dir = tempDir(t, "config");
  assert.equal(readConfig(join(dir, "missing.json")), undefined);

  writeFileSync(join(dir, "ok.json"), '{"a":"b"}');
  assert.equal(readConfig(join(dir, "ok.json"))?.string("a"), "b");

  assert.throws(() => readConfig(dir), (error: Error) => error.message.includes(dir));
});
