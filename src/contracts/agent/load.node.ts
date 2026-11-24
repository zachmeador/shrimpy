import { existsSync, readFileSync } from "node:fs";
import { parseAgentConfig, type ReadAgentConfig } from "./agent-config.ts";
import { type HomePaths, homePaths } from "./layout.node.ts";
import type { ModelId } from "./shapes.ts";
import type { Pigment } from "./sigil.ts";
import type { WakeSettings } from "./wake.ts";

/** An agent home, read from disk and checked. */
export interface LoadedHome {
  readonly name: string;
  /** The model a new session starts with, when `agent.json` names one. */
  readonly model: ModelId | undefined;
  /** The color the agent's sigil is drawn in, when `agent.json` names one. */
  readonly pigment: Pigment | undefined;
  /** The agent's sigil, when `agent.json` has one that checks out. */
  readonly sigil: string[] | undefined;
  /** What wakes the agent in each room it has chosen for, or undefined when what `agent.json` says of it doesn't check out. */
  readonly wake: WakeSettings | undefined;
  /** The parts of `agent.json` that don't check out, each with why. They never stop the rest from being read. */
  readonly leftOut: ReadAgentConfig["leftOut"];
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
  const { config, leftOut } = parseAgentConfig(readFileSync(paths.config, "utf8"), paths.config);
  return {
    name: config.name,
    model: config.model,
    pigment: config.pigment,
    sigil: config.sigil,
    wake: leftOut.wake === undefined ? (config.wake ?? {}) : undefined,
    leftOut,
    paths,
  };
}
