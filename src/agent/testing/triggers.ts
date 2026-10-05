import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homePaths } from "../home/index.ts";

/** Write a trigger's file in a home: `lines` between the dashes, then its prompt. Anything already there is replaced. */
export function writeTrigger(home: string, name: string, lines: string[], prompt = "Do the thing."): void {
  const { triggers } = homePaths(home);
  mkdirSync(triggers, { recursive: true });
  writeFileSync(join(triggers, `${name}.md`), ["---", ...lines, "---", prompt, ""].join("\n"));
}

/** Delete a trigger's file from a home. */
export function removeTrigger(home: string, name: string): void {
  rmSync(join(homePaths(home).triggers, `${name}.md`), { force: true });
}
