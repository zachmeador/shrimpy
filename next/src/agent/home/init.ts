import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import {
  type AgentConfig,
  formatAgentConfig,
  type ModelChoice,
  modelLabel,
  parseAgentConfig,
} from "./agent-config.ts";
import { type HomePaths, homePaths } from "./layout.ts";

export interface InitOptions {
  readonly name: string;
  readonly model: ModelChoice;
}

export interface InitResult {
  readonly paths: HomePaths;
  /** What this call created, as paths inside the home. Empty when the home was already set up. */
  readonly created: string[];
}

const EMPTY_MODELS = `${JSON.stringify({ providers: {} }, null, 2)}\n`;

function startingSoul(name: string): string {
  return [
    "# SOUL",
    "",
    `You are ${name}, a Shrimpy agent built on Pi.`,
    "",
    "- Be direct and concrete.",
    "- Define a specific role, boundaries, and voice here before relying on this agent for important work.",
    "",
  ].join("\n");
}

/**
 * Create the files and folders of an agent home. Anything that already exists
 * is left as it is, so running it again only fills in what is missing. An
 * existing `agent.json` must say the same thing as the options.
 */
export function initHome(home: string, options: InitOptions): InitResult {
  const paths = homePaths(home);
  const config: AgentConfig = { name: options.name, model: options.model };
  // Parsing first means init never writes an agent.json that cannot load.
  const text = formatAgentConfig(config);
  parseAgentConfig(text, paths.config);
  if (existsSync(paths.config)) checkSame(paths, config);

  const created: string[] = [];
  const folder = (path: string): void => {
    if (existsSync(path)) return;
    mkdirSync(path, { recursive: true });
    created.push(relative(paths.root, path));
  };
  const file = (path: string, content: string, mode?: number): void => {
    if (existsSync(path)) return;
    writeFileSync(path, content, { flag: "wx", mode });
    created.push(relative(paths.root, path));
  };

  mkdirSync(paths.root, { recursive: true });
  file(paths.config, text);
  file(paths.soul, startingSoul(config.name));
  folder(paths.context);
  folder(paths.vault);
  folder(paths.skills);
  folder(paths.runtime);
  folder(dirname(paths.models));
  file(paths.models, EMPTY_MODELS);
  // Credentials go in this file, so only its owner may read it.
  file(paths.auth, "{}\n", 0o600);
  return { paths, created };
}

function checkSame(paths: HomePaths, wanted: AgentConfig): void {
  const existing = parseAgentConfig(readFileSync(paths.config, "utf8"), paths.config);
  if (existing.name === wanted.name && modelLabel(existing.model) === modelLabel(wanted.model)) return;
  throw new Error(
    `${paths.config} already describes the agent "${existing.name}" with the model ${modelLabel(existing.model)}. ` +
      "Init does not change an existing agent. Edit that file to change it.",
  );
}
