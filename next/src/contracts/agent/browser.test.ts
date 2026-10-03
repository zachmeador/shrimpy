import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleForBrowser, nodeOnlyInputs } from "../testing/index.ts";

const door = (name: string): string => fileURLToPath(new URL(`./${name}`, import.meta.url));

test("the agent contract's front door bundles for a browser", async () => {
  const bundle = await bundleForBrowser(door("index.ts"));
  assert.deepEqual(nodeOnlyInputs(bundle), []);
  assert.ok(
    Object.keys(bundle.metafile.inputs).some((input) => input.includes("@earendil-works/pi-client")),
  );
});

test("the Node-only door does not bundle for a browser", async () => {
  await assert.rejects(bundleForBrowser(door("node.ts")), /node:fs/);
});
