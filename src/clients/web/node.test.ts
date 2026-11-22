import assert from "node:assert/strict";
import { test } from "node:test";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { MANIFEST, SCRIPT, STYLES, WORKER } from "./files.ts";

/** What a document asks for by itself: what its links and scripts name. */
const asksFor = (html: string): string[] => [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((found) => found[1] ?? "");

/** What styles ask for by themselves: what each url() names, but for what they carry in themselves. */
const urlsIn = (css: string): string[] => [...css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)].map((found) => found[2] ?? "").filter((url) => !url.startsWith("data:"));

test("the gateway serves the page whole, from nowhere but itself: its document and all it asks for, its service worker, and the page again at its own addresses", { timeout: 60_000 }, async (t) => {
  const gateway = await startTestGateway(t);
  const { page } = gateway.listening;
  assert.ok(page !== null, "the gateway serves the page");
  const textAt = async (path: string): Promise<string> => (await fetch(new URL(path, page), { headers: { accept: "text/html" } })).text();

  const html = await textAt("/");
  const asked = asksFor(html);
  assert.ok(asked.includes(SCRIPT) && asked.includes(STYLES) && asked.includes(MANIFEST), "the document asks for its script, its styles and its manifest");
  // The styles ask for the faces' files.
  const fonts = urlsIn(await textAt(STYLES));
  assert.ok(fonts.length > 0, "the styles ask for the faces' files");
  for (const file of [...asked, ...fonts]) {
    const served = await fetch(new URL(file, page));
    assert.equal(served.status, 200, `${file} is served`);
    assert.ok((await served.arrayBuffer()).byteLength > 0, `${file} has something in it`);
  }

  // A page installed to a home screen opens with no browser bar, with an icon a home screen can show.
  const manifest = JSON.parse(await textAt(MANIFEST)) as { display: string; start_url: string; scope: string; icons: { src: string }[] };
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length > 0);
  for (const { src } of manifest.icons) assert.equal((await fetch(new URL(src, page))).headers.get("content-type"), "image/png", `${src} is a picture`);
  const worker = await fetch(new URL(WORKER, page));
  assert.equal(worker.status, 200, "the service worker is served");
  assert.match(worker.headers.get("content-type") ?? "", /javascript/);

  // What a browser fetches by itself for the page is all the page's own, and the page tells the browser to hold it to that.
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'self';/);
  const named = [...asked, ...fonts, manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src)];
  const { origin } = new URL(page);
  assert.deepEqual(
    named.filter((url) => new URL(url, page).origin !== origin),
    [],
    "nothing the document, the styles or the manifest names is on another origin",
  );

  assert.equal(await textAt("/agents/m_1/threads/th_1"), html, "a browser that opens one of the page's addresses is given the page");
  assert.equal((await fetch(new URL("/nothing.js", page))).status, 404, "and a file the page doesn't have is not the page");
});
