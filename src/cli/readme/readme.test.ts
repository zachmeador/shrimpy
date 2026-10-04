import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAll } from "../commands/index.ts";
import { commandTable, withCommandTable } from "./index.ts";

test("the README lists the commands the CLI has", async () => {
  const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");

  const current = withCommandTable(readme, commandTable(await loadAll()));

  assert.ok(current === readme, "The README's table of commands is behind the CLI. Write it again with: npm run readme");
});
