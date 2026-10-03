/**
 * Test support for contracts: checking that a front door can run in a
 * browser. Only tests import this.
 */
import { build, type BuildResult } from "esbuild";

type Bundle = BuildResult<{ metafile: true; write: false }>;

/** Bundle one entry file for a browser. Rejects when it reaches anything that needs Node. */
export function bundleForBrowser(entry: string): Promise<Bundle> {
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

/** The inputs of a bundle that only work in Node, or that should never ship to a browser. */
export function nodeOnlyInputs(bundle: Bundle): string[] {
  return Object.keys(bundle.metafile.inputs).filter(
    (input) => input.startsWith("node:") || input.includes("/esbuild/"),
  );
}
