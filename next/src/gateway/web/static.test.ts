import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { rawRequest } from "../testing/index.ts";
import { startWeb } from "./index.ts";

const timeout = 30_000;

/** A site directory, with files beside it that must never be served. */
function makeSite(t: TestContext): string {
  const base = mkdtempSync(join(tmpdir(), "shrimpy-static-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const site = join(base, "public");
  mkdirSync(join(site, "assets"), { recursive: true });
  mkdirSync(join(site, "empty"));
  mkdirSync(join(base, "public-evil"));
  writeFileSync(join(base, "secret.txt"), "top secret");
  writeFileSync(join(base, "public-evil", "loot.txt"), "loot");
  writeFileSync(join(site, "index.html"), "<h1>home</h1>");
  writeFileSync(join(site, "app.js"), "console.log(1);");
  writeFileSync(join(site, "assets", "logo.svg"), "<svg/>");
  writeFileSync(join(site, "assets", "data.bin"), "bytes");
  writeFileSync(join(site, "with space.txt"), "spaced");
  symlinkSync("../secret.txt", join(site, "link-out.txt"));
  symlinkSync("../public-evil", join(site, "link-out-dir"));
  symlinkSync("app.js", join(site, "link-in.js"));
  return site;
}

function openSite(staticDir: string) {
  return startWeb({ port: 0, staticDir }, () => undefined);
}

test("files are served with their content types, and a directory serves its index", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    const home = await rawRequest(entry.port, "/");
    assert.equal(home.status, 200);
    assert.equal(home.body, "<h1>home</h1>");
    assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(home.headers["x-content-type-options"], "nosniff");

    const script = await rawRequest(entry.port, "/app.js?v=3");
    assert.equal(script.status, 200);
    assert.equal(script.body, "console.log(1);");
    assert.equal(script.headers["content-type"], "text/javascript; charset=utf-8");

    const logo = await rawRequest(entry.port, "/assets/logo.svg");
    assert.equal(logo.headers["content-type"], "image/svg+xml");
    const other = await rawRequest(entry.port, "/assets/data.bin");
    assert.equal(other.headers["content-type"], "application/octet-stream");

    const spaced = await rawRequest(entry.port, "/with%20space.txt");
    assert.equal(spaced.status, 200);
    assert.equal(spaced.body, "spaced");
  } finally {
    await entry.close();
  }
});

test("HEAD sends the headers only, and other methods are refused", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    const head = await rawRequest(entry.port, "/app.js", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(head.headers["content-length"], String("console.log(1);".length));

    for (const method of ["POST", "PUT", "DELETE"]) {
      const refused = await rawRequest(entry.port, "/app.js", method);
      assert.equal(refused.status, 405, method);
      assert.equal(refused.headers.allow, "GET, HEAD");
    }
  } finally {
    await entry.close();
  }
});

test("a missing file, and a directory with no index, are a 404", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    for (const path of ["/nope.js", "/empty", "/empty/", "/assets/", "/assets/missing/x.js"]) {
      assert.equal((await rawRequest(entry.port, path)).status, 404, path);
    }
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
      "/%2E%2E/secret.txt",
      "/..%2fsecret.txt",
      "/%2e%2e%2fsecret.txt",
      "/assets/../../secret.txt",
      "/assets/%2e%2e/%2e%2e/secret.txt",
      "//../secret.txt",
      "/../public-evil/loot.txt",
      "/..%2fpublic-evil%2floot.txt",
      "/assets/..%5c..%5csecret.txt",
      `/${"../".repeat(12)}etc/passwd`,
      "/app.js%00.png",
      "/%00",
      "/%zz",
    ];
    for (const path of attempts) {
      const response = await rawRequest(entry.port, path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.body, /top secret|loot|root:/, path);
    }
  } finally {
    await entry.close();
  }
});

test("a link that leaves the directory is not followed, and one that stays is", { timeout }, async (t) => {
  const entry = await openSite(makeSite(t));
  try {
    for (const path of ["/link-out.txt", "/link-out-dir/loot.txt", "/link-out-dir"]) {
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

test("without a directory the entry serves no files", { timeout }, async () => {
  const entry = await startWeb({ port: 0 }, () => undefined);
  try {
    for (const path of ["/", "/index.html", "/app.js"]) {
      assert.equal((await rawRequest(entry.port, path)).status, 404, path);
    }
  } finally {
    await entry.close();
  }
});

test("a directory that is missing, or is a file, stops the entry from starting", { timeout }, async (t) => {
  const site = makeSite(t);
  await assert.rejects(openSite(join(site, "nowhere")), /ENOENT/);
  await assert.rejects(openSite(join(site, "app.js")), /not a directory/);
});
