import type { AgentModels } from "../../../contracts/agent/index.ts";
import { AGENT_COMMANDS } from "../../../contracts/chat/index.ts";
import type { ModelChoice, Notice } from "../state/index.ts";
import { oneLine } from "./plain.ts";
import { defaultModelLine, MODEL_DEFAULT, modelWords, TERMINAL_COMMANDS, type TerminalCommand } from "./words.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/** What every command does, by name: in a DM, and in a room if it is a command there. The terminal's own `/model` is the one the person gets here. */
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

/** What the terminal does with a text written in a thread. */
export type Written =
  /** It is a message, or a command for agents: it is posted as it was written. */
  | { do: "post" }
  | { do: "status" }
  | { do: "model"; choice: ModelChoice }
  /** It is posted nowhere, and the text stays in the editor. */
  | { do: "refuse"; notice: Notice };

/** A slash first, the name after it, and whatever follows the name. A name is made of what the names of the commands for agents are made of. */
const SLASH_FIRST = /^\s*\/([\p{L}\p{N}_-]*)(.*)$/su;

/**
 * What the terminal does with `text`, written in a thread of a DM or of a room.
 * A text whose first character that is not a space is a slash is a command,
 * always, and is never posted as an ordinary message: a command for agents is
 * posted as it was written, a command for the terminal is acted on and posted
 * nowhere, and a name that is no command there is refused, saying which are, so
 * that nothing is posted by mistake. To start a message with a slash, a person
 * wraps it in backticks or writes anything before it, as `@scout /stop` does,
 * which is posted and acted on by the agent. A command for the terminal is the
 * terminal's wherever it is written: in a place it does not work in, the
 * terminal says where it does, since a message would wake every agent there.
 */
export function writtenIn(text: string, where: "dm" | "room"): Written {
  const found = SLASH_FIRST.exec(text);
  if (found === null) return { do: "post" };
  const name = (found[1] ?? "").toLowerCase();
  const rest = (found[2] ?? "").trim();
  if (isTerminalCommand(name)) {
    if (name === "status") return rest === "" ? { do: "status" } : { do: "refuse", notice: { kind: "takes-nothing", command: `/${name}` } };
    return where === "room" ? { do: "refuse", notice: { kind: "model-in-room" } } : { do: "model", choice: modelChoiceOf(rest) };
  }
  if (Object.hasOwn(AGENT_COMMANDS, name)) return { do: "post" };
  const written = /^\s*(\S+)/.exec(text)?.[1] ?? "/";
  return { do: "refuse", notice: { kind: "no-command", written, commands: commandLines(where).map((command) => command.name) } };
}

/** What the words after `/model` ask for: nothing, the agent's model again, a model written as its provider, a slash and its ID, or something that is none of these. */
function modelChoiceOf(words: string): ModelChoice {
  if (words === "") return { kind: "show" };
  if (words.toLowerCase() === MODEL_DEFAULT) return { kind: "default" };
  // An ID may have slashes of its own, as a model of a router has, and a provider has none.
  const slash = words.indexOf("/");
  if (/\s/.test(words) || slash <= 0 || slash === words.length - 1) return { kind: "unclear" };
  return { kind: "use", model: { provider: words.slice(0, slash), id: words.slice(slash + 1) } };
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
