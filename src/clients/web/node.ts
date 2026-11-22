/**
 * The web client: the page a browser is served at the gateway's page door,
 * which links to the gateway from there. This door is its Node side, which
 * bundles the page for whoever starts the gateway, who hands it over as it is:
 * its document, its script, its styles and the faces' files, its service
 * worker, and the manifest and icons that let it be installed to a home
 * screen. The page itself is browser code and is never imported. It must not
 * know where the gateway listens or how it serves the page.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions, stop } from "esbuild";
import type { PageFile } from "../../contracts/gateway/index.ts";
import { WOOLS } from "../look/index.ts";
import { FONTS, ICONS, MANIFEST, SCRIPT, STYLES, WORKER } from "./files.ts";
import { SHRIMP } from "./glyphs.ts";
import { icon } from "./icon.node.ts";
import { BACKDROP, lookCss } from "./styles.ts";

/** What the page is called where a browser or a home screen names it. */
const NAME = "Shrimpy";

/**
 * What the page may load and run, which the browser itself holds it to: its
 * own files from its gateway, its own link there, and the pictures it carries
 * in itself, which are a home's images and its styles' material.
 */
const POLICY = "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";

/** The page's one document, which loads its styles and its script, and says how it is installed. */
const DOCUMENT = `<!doctype html>
<html lang="en" data-mode="dusk">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="${BACKDROP}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${NAME}</title>
<link rel="manifest" href="${MANIFEST}">
<link rel="icon" href="${ICONS.small.path}">
<link rel="apple-touch-icon" href="${ICONS.touch.path}">
<link rel="stylesheet" href="${STYLES}">
</head>
<body>
<div id="shrimpy"></div>
<script type="module" src="${SCRIPT}"></script>
</body>
</html>
`;

/** What a home screen reads to install the page: its name, where it opens, that it has no browser bar, and its icons. */
const MANIFEST_BODY = JSON.stringify({
  name: NAME,
  short_name: NAME,
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: BACKDROP,
  theme_color: BACKDROP,
  icons: [ICONS.small, ICONS.large].map(({ path, size }) => ({ src: path, sizes: `${String(size)}x${String(size)}`, type: "image/png" })),
});

const here = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

/** The rules for the faces the styles use, as their packages write them: the face upright and italic, and its mono upright. */
const FACES = [
  "@fontsource-variable/atkinson-hyperlegible-next/wght.css",
  "@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css",
  "@fontsource-variable/atkinson-hyperlegible-mono/wght.css",
];

/** The faces' rules, each pointing at its file where the page's door serves it, and those files. */
function faces(): { css: string; files: PageFile[] } {
  const files: PageFile[] = [];
  const css = FACES.map((sheet) => {
    const at = new URL(import.meta.resolve(sheet));
    return readFileSync(at, "utf8").replace(/url\(\.\/files\/([\w.-]+\.woff2)\)/g, (_whole, name: string) => {
      files.push({ path: `${FONTS}/${name}`, type: "font/woff2", body: readFileSync(new URL(`files/${name}`, at)) });
      return `url(${FONTS}/${name})`;
    });
  });
  return { css: css.join("\n"), files };
}

/** A browser's script from `entry`, bundled whole. */
async function bundled(entry: string, format: BuildOptions["format"]): Promise<Uint8Array> {
  const built = await build({
    entryPoints: [here(entry)],
    tsconfig: here("./tsconfig.json"),
    bundle: true,
    platform: "browser",
    format,
    target: "es2022",
    minify: true,
    write: false,
    logLevel: "silent",
  });
  const [script] = built.outputFiles;
  if (script === undefined) throw new Error(`esbuild made no script for ${entry}.`);
  return script.contents;
}

/**
 * The page, bundled from its entries for a browser: its document at "/", its
 * script, its styles with the look's colors and the faces' rules first, the
 * faces' files, its service worker, its manifest and its icons. It takes
 * esbuild a moment, so it is done once, when the gateway starts, and nothing
 * is built by hand.
 */
export async function bundlePage(): Promise<PageFile[]> {
  try {
    // The worker is a classic script, which every browser that has service workers takes.
    const [script, worker] = await Promise.all([bundled("./main.tsx", "esm"), bundled("./worker.ts", "iife")]);
    const { pane, pigments } = WOOLS.dusk;
    const face = faces();
    return [
      { path: "/", type: "text/html; charset=utf-8", body: DOCUMENT },
      { path: SCRIPT, type: "text/javascript; charset=utf-8", body: script },
      { path: STYLES, type: "text/css; charset=utf-8", body: [lookCss(), face.css, readFileSync(here("./page.css"), "utf8")].join("\n") },
      ...face.files,
      { path: WORKER, type: "text/javascript; charset=utf-8", body: worker },
      { path: MANIFEST, type: "application/manifest+json", body: MANIFEST_BODY },
      ...Object.values(ICONS).map(({ path, size }) => ({ path, type: "image/png", body: icon(SHRIMP, size, pane, pigments.coral.mark) })),
    ];
  } finally {
    // esbuild keeps a process of its own for the next build, and there is none.
    await stop();
  }
}
