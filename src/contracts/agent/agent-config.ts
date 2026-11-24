import type { LeftOut } from "../../lib/files/index.ts";
import { ConfigError, type ConfigObject, parseConfig } from "../../lib/json-config/index.ts";
import { withoutPeriod } from "../../lib/text/index.ts";
import type { ModelId } from "./shapes.ts";
import { type Pigment, PIGMENTS, parseSigil } from "./sigil.ts";
import { type WakeSettings, wakeIn } from "./wake.ts";

/** What the file that makes a folder an agent home is called. It holds every setting of the agent. */
export const AGENT_CONFIG = "agent.json";

/** What `agent.json` holds. */
export interface AgentConfig {
  readonly name: string;
  /** The model a new session starts with. Without one, the agent starts with the folder's default model. */
  readonly model?: ModelId;
  /** The color the agent's sigil is drawn in. Without one, a client works it out from the agent's member ID. */
  readonly pigment?: Pigment;
  /** The agent's sigil: twelve lines of twelve characters, `#` for on and `.` for off. Without one, a client works it out from the agent's member ID. */
  readonly sigil?: string[];
  /** What wakes the agent in each room it has chosen for, by the room's name as it was written. */
  readonly wake?: WakeSettings;
}

/**
 * `agent.json` as it was read. Its sigil and its wake settings are checked on
 * their own: one that doesn't check out is missing from `config` and named in
 * `leftOut`, and the rest of the file is read anyway.
 */
export interface ReadAgentConfig {
  readonly config: AgentConfig;
  readonly leftOut: { readonly sigil?: LeftOut; readonly wake?: LeftOut };
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** What a name must be: an agent's, and a trigger's, which follows the same rule. */
export const NAME_RULE = "must start with a letter or digit and use only letters, digits, dots, hyphens and underscores";

/** Whether `name` follows the rule for names. */
export const isName = (name: string): boolean => NAME.test(name);

/** For a name that comes from outside a file, such as a command line. */
export function checkAgentName(name: string): void {
  if (!isName(name)) throw new Error(`The agent name "${name}" ${NAME_RULE}.`);
}

/**
 * Read `agent.json` from `text`, which is the file `file`. A name, a model or a
 * pigment that doesn't check out, or a key it doesn't know, is an error that
 * names the file and the key.
 */
export function parseAgentConfig(text: string, file: string): ReadAgentConfig {
  const root = parseConfig(text, file);
  const name = root.string("name");
  if (!NAME.test(name)) throw root.problem("name", NAME_RULE);
  const model = root.optionalObject("model");
  const choice = model === undefined ? undefined : readModelChoice(model);
  const pigment = root.optionalChoice("pigment", PIGMENTS);
  const drawn = root.optionalUnchecked("sigil");
  const sigil = drawn === undefined ? undefined : parseSigil(drawn);
  const wake = wakeOf(root, file);
  root.done();
  const config: AgentConfig = {
    name,
    ...(choice === undefined ? {} : { model: choice }),
    ...(pigment === undefined ? {} : { pigment }),
    ...(sigil === undefined ? {} : { sigil }),
    ...(wake.settings === undefined ? {} : { wake: wake.settings }),
  };
  const notASigil = drawn !== undefined && sigil === undefined;
  return {
    config,
    leftOut: {
      ...(notASigil ? { sigil: { file: keyIn("sigil"), reason: NOT_A_SIGIL } } : {}),
      ...(wake.reason === undefined ? {} : { wake: { file: keyIn("wake"), reason: wake.reason } }),
    },
  };
}

/** Why a sigil that isn't one is left out, in words that finish `"sigil" in agent.json was left out: `. */
const NOT_A_SIGIL = "it isn't twelve lines of twelve # or . characters";

/** A key of `agent.json` as a left-out part of it is named. */
const keyIn = (key: string): string => `"${key}" in ${AGENT_CONFIG}`;

/** The wake settings `agent.json` has, or why they don't check out, without the file's path, which comes first in a config error. */
function wakeOf(root: ConfigObject, file: string): { settings?: WakeSettings; reason?: string } {
  try {
    const settings = wakeIn(root);
    return settings === undefined ? {} : { settings };
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { reason: withoutPeriod(error.message.replace(`${file}: `, "")) };
  }
}

/** A model as `agent.json` and the folder's `default-model.json` write it: the provider and the ID. */
export function readModelChoice(object: ConfigObject): ModelId {
  const choice = { provider: object.string("provider"), id: object.string("id") };
  object.done();
  return choice;
}

/** `config` as Shrimpy writes `agent.json`: each line of the sigil on a line of its own, where an agent can redraw it. */
export function formatAgentConfig(config: object): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Read `provider/id`, like `anthropic/claude-sonnet-4-5`. Everything after the first slash is the ID. */
export function parseModelChoice(text: string): ModelId {
  const slash = text.indexOf("/");
  if (slash < 1 || slash === text.length - 1) {
    throw new Error(`Model "${text}" should be provider/id, such as anthropic/claude-sonnet-4-5.`);
  }
  return { provider: text.slice(0, slash), id: text.slice(slash + 1) };
}

/** Whether `a` and `b` are one model: the same provider and the same ID. */
export const sameModel = (a: ModelId, b: ModelId): boolean => a.provider === b.provider && a.id === b.id;
