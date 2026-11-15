import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PI_PACKAGES, SHRIMPY_VERSION } from "./index.ts";

const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  version: string;
  dependencies: Record<string, string>;
};

test("the version is the one in package.json", () => {
  assert.equal(SHRIMPY_VERSION, manifest.version);
});

test("the Pi packages are package.json's, at their exact versions", () => {
  const pi = Object.fromEntries(Object.entries(manifest.dependencies).filter(([name]) => name.startsWith("@earendil-works/")));
  assert.deepEqual(PI_PACKAGES, pi);
});
