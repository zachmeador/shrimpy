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
