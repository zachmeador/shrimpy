import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { rawRequest } from "../testing/index.ts";
import { startWeb } from "./index.ts";

const timeout = 30_000;

/** A site directory, with files beside it that must never be served. */
function makeSite(t: TestContext): string {
  const base = tempDir(t, "static");
  const site = join(base, "public");
  mkdirSync(join(site, "assets"), { recursive: true });
  mkdirSync(join(site, "empty"));
  mkdirSync(join(base, "public-evil"));
  writeFileSync(join(base, "secret.txt"), "top secret");
  writeFileSync(join(base, "public-evil", "loot.txt"), "loot");
  writeFileSync(join(site, "index.html"), "<h1>home</h1>");
  writeFileSync(join(site, "app.js"), "console.log(1);");
  writeFileSync(join(site, "with space.txt"), "spaced");
  symlinkSync("../secret.txt", join(site, "link-out.txt"));
  symlinkSync("../public-evil", join(site, "link-out-dir"));
  symlinkSync("app.js", join(site, "link-in.js"));
  return site;
}

function openSite(staticDir: string) {
  return startWeb({ port: 0, staticDir }, () => undefined);
}

test("files are served with their content types, a directory serves its index, and one without an index serves nothing", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    const home = await rawRequest(entry.port, "/");
    assert.equal(home.status, 200);
    assert.equal(home.body, "<h1>home</h1>");
    assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(home.headers["x-content-type-options"], "nosniff");

    const script = await rawRequest(entry.port, "/app.js?v=3");
    assert.equal(script.status, 200);
    assert.equal(script.headers["content-type"], "text/javascript; charset=utf-8");

    const spaced = await rawRequest(entry.port, "/with%20space.txt");
    assert.equal(spaced.body, "spaced");

    assert.equal((await rawRequest(entry.port, "/empty")).status, 404);
  } finally {
    await entry.close();
  }
});

test("no path leads outside the directory, however it is written", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    const attempts = [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/..%2fpublic-evil%2floot.txt",
      "/assets/../../secret.txt",
      "/app.js%00.png",
      "/%zz",
    ];
    for (const path of attempts) {
      const response = await rawRequest(entry.port, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /top secret|loot/, path);
    }
  } finally {
    await entry.close();
  }
});

test("a link that leaves the directory is not followed, and one that stays is", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    for (const path of ["/link-out.txt", "/link-out-dir/loot.txt"]) {
      const response = await rawRequest(entry.port, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /top secret|loot/, path);
    }

    const inside = await rawRequest(entry.port, "/link-in.js");
    assert.equal(inside.status, 200);
    assert.equal(inside.body, "console.log(1);");
  } finally {
    await entry.close();
  }
});
