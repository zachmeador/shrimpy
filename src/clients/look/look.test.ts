import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleForBrowser, nodeOnlyInputs } from "../../contracts/testing/index.ts";
import { dots, halves, path } from "./index.ts";

test("the clients' look's front door bundles for a browser", async () => {
  const bundle = await bundleForBrowser(fileURLToPath(new URL("./index.ts", import.meta.url)));
  assert.deepEqual(nodeOnlyInputs(bundle), []);
});

test("a bitmap is the same picture as dots, as half blocks and as a path", () => {
  const rows = ["#.", ".#", "#.", ".."];
  assert.deepEqual(dots(rows), ["⠕"]);
  assert.deepEqual(halves(rows), ["▀▄", "▀ "]);
  assert.equal(path(rows), "M0 0h1v1h-1zM1 1h1v1h-1zM0 2h1v1h-1z");
});
