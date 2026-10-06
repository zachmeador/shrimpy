import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homePaths } from "../home/index.ts";

/** Write a breadcrumb in a home, as a script or the agent would: the file `<name>.md`, in place of any that is there. */
export function leaveBreadcrumb(home: string, name: string, text: string): void {
  const { breadcrumbs } = homePaths(home);
  mkdirSync(breadcrumbs, { recursive: true });
  writeFileSync(join(breadcrumbs, `${name}.md`), `${text}\n`);
}
