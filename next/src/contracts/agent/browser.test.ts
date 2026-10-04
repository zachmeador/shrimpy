import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleForBrowser, nodeOnlyInputs } from "../testing/index.ts";

test("the agent contract's front door bundles for a browser", async () => {
  const bundle = await bundleForBrowser(fileURLToPath(new URL("./index.ts", import.meta.url)));
  assert.deepEqual(nodeOnlyInputs(bundle), []);
  assert.ok(
    Object.keys(bundle.metafile.inputs).some((input) => input.includes("@earendil-works/pi-client")),
  );
});
