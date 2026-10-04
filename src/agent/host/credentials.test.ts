import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { readCredentials } from "./credentials.ts";

test("a key is used as written, so a command or a variable in its place is refused", (t) => {
  for (const key of ["!pass show anthropic", "$ANTHROPIC_API_KEY"]) {
    const file = join(tempDir(t, "auth"), "auth.json");
    writeFileSync(file, JSON.stringify({ anthropic: { type: "api_key", key } }));
    assert.throws(
      () => readCredentials(file),
      (error: Error) => error.message.includes(file) && error.message.includes("anthropic.key"),
      key,
    );
  }
});
