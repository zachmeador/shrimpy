import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readConfig } from "../../lib/json-config/node.ts";
import { type ModelChoice, readModelChoice } from "./agent-config.ts";

/**
 * The model `default-model.json` names, which an agent starts with when its
 * `agent.json` names none. A file that is not there names none.
 */
export function readDefaultModel(file: string): ModelChoice | undefined {
  const root = readConfig(file);
  return root === undefined ? undefined : readModelChoice(root);
}

/** Write `default-model.json`, making its folder if it is missing. A file that is there is left as it is, and that is an error. */
export function saveDefaultModel(file: string, model: ModelChoice): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const text = `${JSON.stringify({ provider: model.provider, id: model.id }, null, 2)}\n`;
  writeFileSync(file, text, { flag: "wx" });
}
