import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SHRIMPY_VERSION } from "./index.ts";

test("the version is the one in package.json", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };

  assert.equal(SHRIMPY_VERSION, manifest.version);
});
