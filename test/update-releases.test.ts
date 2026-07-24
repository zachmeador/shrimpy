import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  compareSemver,
  newestTaggedRelease,
  resolveTaggedReleases,
} from "../dist/update/releases.js";

describe("tagged Shrimpy releases", () => {
  test("accepts semantic v-tags and ignores branch-like or malformed refs", () => {
    const releases = resolveTaggedReleases("origin", () => [
      "bbbb refs/tags/v0.6.0",
      "aaaa refs/tags/v0.5.0",
      "cccc refs/tags/v0.7.0",
      "dddd refs/tags/v0.7.0^{}",
      "cccc refs/tags/latest",
      "dddd refs/heads/main",
      "",
    ].join("\n"));

    assert.deepEqual(releases, [
      { tag: "v0.7.0", version: "0.7.0", commit: "dddd" },
      { tag: "v0.6.0", version: "0.6.0", commit: "bbbb" },
      { tag: "v0.5.0", version: "0.5.0", commit: "aaaa" },
    ]);
    assert.equal(newestTaggedRelease(releases, "0.5.0")?.tag, "v0.7.0");
  });

  test("orders prereleases below their final release", () => {
    assert.equal(compareSemver("0.6.0", "0.6.0-alpha.2") > 0, true);
    assert.equal(compareSemver("0.6.0-alpha.10", "0.6.0-alpha.2") > 0, true);
  });
});
