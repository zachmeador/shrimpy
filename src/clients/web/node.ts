/**
 * The web client: the page a browser is served at the gateway's page door,
 * which links to the gateway from there. This door is its Node side, which
 * bundles the page from its entry for whoever starts the gateway, who hands it
 * over as it is. The page itself is browser code and is never imported. It
 * must not know where the gateway listens or how it serves the page.
 */
import { fileURLToPath } from "node:url";
import { build, stop } from "esbuild";
import type { PageFile } from "../../contracts/gateway/index.ts";

/** The page's one document, which loads its script. */
const DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shrimpy</title>
</head>
<body>
<div id="shrimpy"></div>
<script type="module" src="/page.js"></script>
</body>
</html>
`;

/**
 * The page, bundled from its entry for a browser: its document at "/" and its
 * script. It takes esbuild a moment, so it is done once, when the gateway
 * starts, and nothing is built by hand.
 */
export async function bundlePage(): Promise<PageFile[]> {
  try {
    const built = await build({
      entryPoints: [fileURLToPath(new URL("./main.tsx", import.meta.url))],
      tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      write: false,
      logLevel: "silent",
    });
    const [script] = built.outputFiles;
    if (script === undefined) throw new Error("esbuild made no script for the page.");
    return [
      { path: "/", type: "text/html; charset=utf-8", body: DOCUMENT },
      { path: "/page.js", type: "text/javascript; charset=utf-8", body: script.contents },
    ];
  } finally {
    // esbuild keeps a process of its own for the next build, and there is none.
    await stop();
  }
}
