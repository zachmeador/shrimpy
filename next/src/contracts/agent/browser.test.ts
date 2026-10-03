import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const door = (name: string): string => fileURLToPath(new URL(`./${name}`, import.meta.url));

function bundleForBrowser(entry: string) {
  return build({
    entryPoints: [entry],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
}

test("the agent contract's front door bundles for a browser", async () => {
  const result = await bundleForBrowser(door("index.ts"));
  const inputs = Object.keys(result.metafile.inputs);
  assert.deepEqual(
    inputs.filter((input) => input.startsWith("node:") || input.includes("/esbuild/")),
    [],
  );
  assert.ok(inputs.some((input) => input.includes("@earendil-works/pi-client")));
});

test("the Node-only door does not bundle for a browser", async () => {
  await assert.rejects(bundleForBrowser(door("node.ts")), /node:fs/);
});
