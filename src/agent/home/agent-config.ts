import { parseConfig } from "../../lib/json-config/index.ts";

/** A model by the provider that serves it and the ID that provider knows it by. */
export interface ModelChoice {
  readonly provider: string;
  readonly id: string;
}

/** What `agent.json` holds. */
export interface AgentConfig {
  readonly name: string;
  /** The model a new session starts with. */
  readonly model: ModelChoice;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NAME_RULE = "must start with a letter or digit and use only letters, digits, dots, hyphens and underscores";

/** For a name that comes from outside a file, such as a command line. */
export function checkAgentName(name: string): void {
  if (!NAME.test(name)) throw new Error(`The agent name "${name}" ${NAME_RULE}.`);
}

export function parseAgentConfig(text: string, file: string): AgentConfig {
  const root = parseConfig(text, file);
  const name = root.string("name");
  if (!NAME.test(name)) throw root.problem("name", NAME_RULE);
  const model = root.object("model");
  const choice = { provider: model.string("provider"), id: model.string("id") };
  model.done();
  root.done();
  return { name, model: choice };
}

export function formatAgentConfig(config: AgentConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Read `provider/id`, like `anthropic/claude-sonnet-4-5`. Everything after the first slash is the ID. */
export function parseModelChoice(text: string): ModelChoice {
  const slash = text.indexOf("/");
  if (slash < 1 || slash === text.length - 1) {
    throw new Error(`Model "${text}" should be provider/id, such as anthropic/claude-sonnet-4-5.`);
  }
  return { provider: text.slice(0, slash), id: text.slice(slash + 1) };
}

export function modelLabel(model: ModelChoice): string {
  return `${model.provider}/${model.id}`;
}
