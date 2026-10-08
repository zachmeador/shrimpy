import type { AgentModels } from "../../../contracts/agent/index.ts";
import { AGENT_COMMANDS, type AgentCommand } from "../../../contracts/chat/index.ts";
import type { Notice } from "../state/index.ts";
import { oneLine } from "./plain.ts";
import { defaultModelLine, MODEL_DEFAULT, modelWords, TERMINAL_COMMANDS, type TerminalCommand } from "./words.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/**
 * A name is a command for agents or one for the terminal, never both, since the
 * terminal would take it before any agent could. This stops compiling when a
 * name is in both. The one thing the terminal does with a command for agents is
 * answer `/model` alone, which `writtenIn` says.
 */
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
const isAgentCommand = (name: string): name is AgentCommand => Object.hasOwn(AGENT_COMMANDS, name);

/** What the terminal does with a text written in a thread. */
export type Written =
  /** It is a message, or a command for agents: it is posted as it was written. */
  | { do: "post" }
  | { do: "status" }
  /** `/model` alone: the terminal says which model the thread runs on. */
  | { do: "model" }
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
 * which is posted and acted on by the agent.
 *
 * Two things set a command for agents apart from the rest. In a room, one that
 * is for nobody unless an agent is named, as the chat contract says of each, is
 * refused when it is written first, since it mentions nobody: `@scout /model x`
 * is how it is written there. And `/model` alone in a DM is answered by the
 * terminal, which can see which model the thread runs on, and is not posted.
 * With anything after it, it is posted like any command for agents.
 */
export function writtenIn(text: string, where: "dm" | "room"): Written {
  const found = SLASH_FIRST.exec(text);
  if (found === null) return { do: "post" };
  const name = (found[1] ?? "").toLowerCase();
  const rest = (found[2] ?? "").trim();
  if (isTerminalCommand(name)) {
    return rest === "" ? { do: "status" } : { do: "refuse", notice: { kind: "takes-nothing", command: `/${name}` } };
  }
  if (isAgentCommand(name)) {
    if (where === "room" && AGENT_COMMANDS[name].withoutMention === "nobody") return { do: "refuse", notice: { kind: "name-an-agent", command: name } };
    return name === "model" && where === "dm" && rest === "" ? { do: "model" } : { do: "post" };
  }
  const written = /^\s*(\S+)/.exec(text)?.[1] ?? "/";
  return { do: "refuse", notice: { kind: "no-command", written, commands: commandLines(where).map((command) => command.name) } };
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
