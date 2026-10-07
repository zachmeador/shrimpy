import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import {
  type AgentConfig,
  checkAgentName,
  formatAgentConfig,
  type ModelChoice,
  modelLabel,
  parseAgentConfig,
} from "./agent-config.ts";
import { type HomePaths, homePaths } from "./layout.ts";

export interface InitOptions {
  readonly name: string;
  /** The model the agent starts with. Without one, `agent.json` names none, and the agent starts with the folder's default. */
  readonly model?: ModelChoice;
}

export interface InitResult {
  readonly paths: HomePaths;
  /** What this call created, as paths inside the home. Empty when the home was already set up. */
  readonly created: string[];
}

const EMPTY_MODELS = `${JSON.stringify({ providers: {} }, null, 2)}\n`;

/**
 * The agent's own instructions to begin with, every word for the model. They
 * stand on their own: the instructions every agent gets already say who it is
 * and how Shrimpy works, so none of that is here.
 */
const STARTING_SOUL = `${[
  "Be direct, calm and useful. Do what you are asked when it is clear, and ask one short question when it isn't. Say plainly when you don't know something or can't do it.",
  "Check with the person before anything you can't undo, such as deleting files or sending a message for them.",
  "Answer as briefly as the question allows. You enjoy the shrimp emoji 🦐.",
].join("\n\n")}\n`;

/**
 * Create the files and folders of an agent home. Anything that already exists
 * is left as it is, so running it again only fills in what is missing. An
 * existing `agent.json` must say the same thing as the options: with no model
 * in them, whatever model it names is no difference.
 */
export function initHome(home: string, options: InitOptions): InitResult {
  const paths = homePaths(home);
  const config: AgentConfig = { name: options.name, ...(options.model === undefined ? {} : { model: options.model }) };
  checkAgentName(config.name);
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
  file(paths.soul, STARTING_SOUL);
  folder(paths.context);
  folder(paths.vault);
  folder(paths.skills);
  folder(paths.breadcrumbs);
  folder(paths.runtime);
  folder(dirname(paths.models));
  file(paths.models, EMPTY_MODELS);
  // Credentials go in this file, so only its owner may read it.
  file(paths.auth, "{}\n", 0o600);
  return { paths, created };
}

function checkSame(paths: HomePaths, wanted: AgentConfig): void {
  const existing = parseAgentConfig(readFileSync(paths.config, "utf8"), paths.config);
  const sameModel =
    wanted.model === undefined ||
    (existing.model !== undefined && modelLabel(existing.model) === modelLabel(wanted.model));
  if (existing.name === wanted.name && sameModel) return;
  const has = existing.model === undefined ? "no model of its own" : `the model ${modelLabel(existing.model)}`;
  throw new Error(
    `${paths.config} already describes the agent "${existing.name}" with ${has}. ` +
      "Init does not change an existing agent. Edit that file to change it.",
  );
}
