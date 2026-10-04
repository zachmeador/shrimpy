/** Rewrites the README's table of commands from the commands the CLI has: `npm run readme`. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadAll } from "../commands/index.ts";
import { commandTable, withCommandTable } from "./index.ts";

const file = fileURLToPath(new URL("../../../README.md", import.meta.url));
const before = readFileSync(file, "utf8");
const after = withCommandTable(before, commandTable(await loadAll()));
if (after === before) {
  console.log("README.md already lists the commands the CLI has.");
} else {
  writeFileSync(file, after);
  console.log("README.md now lists the commands the CLI has.");
}
