import { type AgentModel, type ModelId, modelWords } from "../../contracts/agent/index.ts";
import { AGENT_COMMANDS, type AgentCommand } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { commandNames, type Standing } from "../state/index.ts";
import { CLIENT_COMMAND_LINES, defaultModelLine, MODEL_DEFAULT } from "./words.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/** What every command does, by name: in a DM, and in a room if it is a command there. */
const LINES: Record<string, { dm: string; room?: string }> = { ...AGENT_COMMANDS, ...CLIENT_COMMAND_LINES };

/**
 * Every command that can be written in a thread of a DM with an agent, or of a
 * room, that stands as `standing`, in order of name, each with what it does
 * there: the commands for agents, which are posted for the agents they are for
 * to act on, and the commands for the client, which the client acts on itself
 * and posts nowhere. `updates` says whether the client updates its own
 * machine, and so offers `/update`.
 */
export function commandLines(where: "dm" | "room", standing: Standing, updates = false): CommandLine[] {
  return commandNames(where, standing, updates).map((name) => ({ name, line: LINES[name.slice(1)]?.[where] ?? "" }));
}

/** The command after which a model is written, with its slash. */
const MODEL_COMMAND = "/model" satisfies `/${AgentCommand}`;

/** What is before the cursor, when that is a slash and nothing after it but the word the cursor is at the end of. */
const COMMAND_WORD = /^\s*(\/\S*)$/;

/** What is before the cursor, when that is `/model`, a space, and what has been typed of the model so far. */
const MODEL_WORD = /^\s*\/model\s+(\S*)$/i;

/** The command being typed in `before`, what is typed before the cursor in the text's first line: its slash and the start of its name, while the cursor is still in it. */
export const commandWord = (before: string): string | undefined => COMMAND_WORD.exec(before)?.[1];

/** Whether the command called `name` is one that `word`, its start as typed, could become. */
export const commandFits = (name: string, word: string): boolean => name.startsWith(word.toLowerCase());

/**
 * The commands that `word`, as `commandWord` gives it, could become, in their
 * order. A name typed whole leaves nothing to choose, so there are none, but
 * for `/model`, after which a model comes.
 */
export function commandsFitting(word: string, commands: readonly CommandLine[]): CommandLine[] {
  const matches = commands.filter((command) => commandFits(command.name, word));
  const [only] = matches;
  return matches.length === 1 && only?.name === word.toLowerCase() && only.name !== MODEL_COMMAND ? [] : matches;
}

/** Whether `/model` is among `commands`, so that what is typed after it chooses a model. */
export const offersModels = (commands: readonly CommandLine[]): boolean => commands.some((command) => command.name === MODEL_COMMAND);

/** What is typed of a model in `before`, what is typed before the cursor in the text's first line, when that is `/model` and a space. */
export const modelWord = (before: string): string | undefined => MODEL_WORD.exec(before)?.[1];

/** Whether the model written as `value` is one that `typed` could become: `default` only as it is written out, and a model by any part of its name. */
export function modelFits(value: string, typed: string): boolean {
  const written = value.toLowerCase();
  const start = typed.toLowerCase();
  return value === MODEL_DEFAULT ? written.startsWith(start) : written.includes(start);
}

/**
 * The models that `typed`, as `modelWord` gives it, could become: `default`
 * first, then the models the typing starts, then those it is found in. A model
 * typed whole leaves nothing to choose, so there are none.
 */
export function modelsFitting(typed: string, models: readonly ModelLine[]): ModelLine[] {
  const start = typed.toLowerCase();
  const begins = (each: ModelLine): boolean => each.value.toLowerCase().startsWith(start);
  const fitting = models.filter((each) => modelFits(each.value, typed)).sort((a, b) => Number(begins(b)) - Number(begins(a)));
  return fitting.length === 1 && fitting[0]?.value === typed ? [] : fitting;
}

/** One choice in the list that `/model ` opens: what is written for it, and one line on it. */
export interface ModelLine {
  value: string;
  line: string;
}

/**
 * What the list that `/model ` opens offers, in the agent's order but for
 * `default`, which comes first and says which model it stands for: the model
 * each is written as, and the name the agent has for it.
 */
export function modelLines(models: readonly AgentModel[], defaultModel: ModelId, agent: string): ModelLine[] {
  return [
    { value: MODEL_DEFAULT, line: defaultModelLine(agent, defaultModel) },
    ...models.map((model) => ({ value: modelWords(model), line: oneLine(model.name) })),
  ];
}
