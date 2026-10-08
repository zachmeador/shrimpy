import type { AgentModels } from "../../../contracts/agent/index.ts";
import { AGENT_COMMANDS, type AgentCommand } from "../../../contracts/chat/index.ts";
import type { ModelChoice } from "../state/index.ts";
import { oneLine } from "./plain.ts";
import { defaultModelLine, MODEL_DEFAULT, modelWords, TERMINAL_COMMANDS, type TerminalCommand } from "./words.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/** A command is for the agents or for the terminal, never both, since the terminal would take it before any agent could. This stops compiling when a name is in both. */
const _inOneKind: [Extract<AgentCommand, TerminalCommand>] extends [never] ? true : never = true;

/** What every command does, by name: in a DM, and in a room if it is a command there. */
const LINES: Record<string, { dm: string; room?: string }> = { ...AGENT_COMMANDS, ...TERMINAL_COMMANDS };

/**
 * Every command that can be written in a thread of a DM with an agent, or of a
 * room, in order of name, each with what it does there: the commands for
 * agents, which are posted for the agents they are for to act on, and the
 * commands for the terminal, which the terminal acts on itself and posts nowhere.
 * A command with no line for a place is none there.
 */
export function commandLines(where: "dm" | "room"): CommandLine[] {
  return Object.entries(LINES)
    .flatMap(([name, lines]) => {
      const line = lines[where];
      return line === undefined ? [] : [{ name: `/${name}`, line }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const isTerminalCommand = (name: string): name is TerminalCommand => Object.hasOwn(TERMINAL_COMMANDS, name);

/** What a text that is a command for the terminal asks for. */
export type TerminalInput = { name: "status" } | { name: "model"; choice: ModelChoice };

/** A slash and a name, and one word after it, if there is one, with nothing else but spaces around. */
const COMMAND = /^\s*\/(\S+)(?:\s+(\S+))?\s*$/;

/**
 * The command for the terminal that a text is, if it is one where the person
 * is writing: all of it, but for the spaces around it, is a slash and the
 * command's name, and for `/model` one word after that. Anything else that
 * starts with a slash is a message, since a command for the terminal posts
 * nothing and a message that was taken for one would be lost. A command that a
 * place has no line for is a message there.
 */
export function terminalCommandOf(text: string, where: "dm" | "room"): TerminalInput | undefined {
  const found = COMMAND.exec(text);
  const name = found?.[1]?.toLowerCase();
  if (name === undefined || !isTerminalCommand(name) || LINES[name]?.[where] === undefined) return undefined;
  const word = found?.[2];
  if (name === "status") return word === undefined ? { name } : undefined;
  return { name, choice: modelChoiceOf(word) };
}

/** What the word after `/model` asks for: nothing, the agent's model again, a model written as its provider, a slash and its ID, or something that is none of these. */
function modelChoiceOf(word: string | undefined): ModelChoice {
  if (word === undefined) return { kind: "show" };
  if (word.toLowerCase() === MODEL_DEFAULT) return { kind: "default" };
  // An ID may have slashes of its own, as a model of a router has, and a provider has none.
  const slash = word.indexOf("/");
  if (slash <= 0 || slash === word.length - 1) return { kind: "unclear" };
  return { kind: "use", model: { provider: word.slice(0, slash), id: word.slice(slash + 1) } };
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
export function modelLines(models: AgentModels, agent: string): ModelLine[] {
  return [
    { value: MODEL_DEFAULT, line: defaultModelLine(agent, models.default) },
    ...models.models.map((model) => ({ value: modelWords(model), line: oneLine(model.name) })),
  ];
}
