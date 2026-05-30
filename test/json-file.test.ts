import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readJsonFile,
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../dist/util/json-file.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shrimpy-json-file-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("json-file persistence helpers", () => {
  test("writes formatted json atomically and creates parent directories", () => {
    const path = join(root, "nested", "state.json");

    writeJsonFileAtomic(path, { ok: true, count: 2 });

    assert.equal(existsSync(path), true);
    assert.equal(readFileSync(path, "utf-8").endsWith("\n"), true);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf-8")), {
      ok: true,
      count: 2,
    });
    assert.deepEqual(
      readdirSync(join(root, "nested")).filter((file) => file.endsWith(".tmp")),
      [],
    );
  });

  test("uses fallback for missing, malformed, or rejected json", () => {
    const path = join(root, "state.json");
    const fallback = () => ({ count: 0 });
    const parse = (raw: unknown) => {
      if (
        typeof raw !== "object"
        || raw === null
        || Array.isArray(raw)
        || typeof (raw as Record<string, unknown>).count !== "number"
      ) {
        throw new Error("invalid");
      }
      return { count: (raw as Record<string, number>).count };
    };

    assert.deepEqual(readJsonFile(path, fallback, parse), { count: 0 });

    writeFileSync(path, "{", "utf-8");
    assert.deepEqual(readJsonFile(path, fallback, parse), { count: 0 });

    writeJsonFileAtomic(path, { count: "nope" });
    assert.deepEqual(readJsonFile(path, fallback, parse), { count: 0 });
  });

  test("strict reads surface invalid json instead of falling back", () => {
    const path = join(root, "strict.json");
    writeFileSync(path, "{", "utf-8");

    assert.throws(
      () => readJsonFileStrict(path, (raw) => raw),
      SyntaxError,
    );
  });
});
