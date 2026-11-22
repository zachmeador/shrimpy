import { existsSync, readFileSync } from "node:fs";
import { parseAgentConfig } from "./agent-config.ts";
import { type HomePaths, homePaths } from "./layout.node.ts";
import type { ModelId } from "./shapes.ts";
import type { Pigment } from "./sigil.ts";

/** An agent home, read from disk and checked. */
export interface LoadedHome {
  readonly name: string;
  /** The model a new session starts with, when `agent.json` names one. */
  readonly model: ModelId | undefined;
  /** The color the agent's sigil is drawn in, when `agent.json` names one. */
  readonly pigment: Pigment | undefined;
  readonly paths: HomePaths;
}

export function loadHome(home: string): LoadedHome {
  const paths = homePaths(home);
  if (!existsSync(paths.config)) {
    throw new Error(
      `${paths.root} is not an agent home: ${paths.config} is missing. ` +
        `Create one with: shrimpy agent init ${paths.root} --model <provider/id>`,
    );
  }
  const config = parseAgentConfig(readFileSync(paths.config, "utf8"), paths.config);
  return { name: config.name, model: config.model, pigment: config.pigment, paths };
}
