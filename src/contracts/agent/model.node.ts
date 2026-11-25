import { readFileSync } from "node:fs";
import { saveFile } from "../../lib/files/node.ts";
import { parseConfig } from "../../lib/json-config/index.ts";
import { formatAgentConfig } from "./agent-config.ts";
import { loadHome } from "./load.node.ts";
import type { ModelId } from "./shapes.ts";

/**
 * Name `model` in the home's `agent.json`, or take the model out of it for
 * null, so that the agent follows the folder's default model. The file is
 * written whole, so nobody reading it at the same moment sees half of it, and
 * the rest of it is kept as it is. An `agent.json` that doesn't load is left as
 * it is, and the error says why.
 */
export function saveModel(home: string, model: ModelId | null): { file: string } {
  const { paths } = loadHome(home);
  // Everything else in the file is written back as it was read, a sigil that doesn't check out included.
  const { model: _named, ...rest } = parseConfig(readFileSync(paths.config, "utf8"), paths.config).rest();
  const config = model === null ? rest : { ...rest, model: { provider: model.provider, id: model.id } };
  saveFile(paths.config, formatAgentConfig(config));
  return { file: paths.config };
}
