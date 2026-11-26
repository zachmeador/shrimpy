import { AGENT_COMMANDS, type AgentCommand, agentCommandIn, mentions } from "../../contracts/chat/index.ts";
import { MAX_NAME } from "../../contracts/gateway/index.ts";
import { cutEnd, singleSpaced } from "../../lib/text/index.ts";
import { type Model, type Notice, openThreadOf } from "./model.ts";

/** The commands a client acts on itself and posts nowhere, by name, in a DM with an agent and in a room alike. */
export const CLIENT_COMMANDS = ["archive", "devices", "rename", "status", "unarchive", "update"] as const;

/** The name of a command for the client, without its slash. */
export type ClientCommand = (typeof CLIENT_COMMANDS)[number];

/** The commands only a client that updates its own machine offers, as the terminal does. A page comes from the gateway, so it has nothing to update. */
const UPDATING: readonly ClientCommand[] = ["update"];

/** Whether a client takes its command `name`: `/update` only when it updates its own machine. */
const takes = (name: ClientCommand, updates: boolean): boolean => updates || !UPDATING.includes(name);

/**
 * A name is a command for agents or one for the client, never both, since the
 * client would take it before any agent could. This stops compiling when a
 * name is in both. The one thing a client does with a command for agents is
 * answer `/model` alone, which `writtenIn` says.
 */
const _inOneKind: [Extract<AgentCommand, ClientCommand>] extends [never] ? true : never = true;

/** The commands for agents by what each says it does, in a DM and in a room, where a command may have no line for a room. */
const AGENT_LINES: Record<string, { dm: string; room?: string }> = AGENT_COMMANDS;

/** How the thread written in stands, which decides which commands there are: not started yet, started, or archived. */
export type Standing = "new" | "live" | "archived";

/** Whether the client's command `name` is offered in a thread that stands as `standing`: a started thread is renamed, and archived or brought back, whichever it isn't. */
function offeredIn(name: ClientCommand, standing: Standing): boolean {
  switch (name) {
    case "rename":
      return standing !== "new";
    case "archive":
      return standing === "live";
    case "unarchive":
      return standing === "archived";
    default:
      return true;
  }
}

/**
 * Every command that can be written in a thread of a DM with an agent, or of a
 * room, with its slash, in order of name: the commands for agents that say what
 * they do there, which are posted for the agents they are for to act on, and
 * the commands for the client, which the client acts on itself, of those
 * offered in a thread that stands as `standing` by a client that updates its
 * own machine, or doesn't. With no `standing`, every command that can be
 * written in a thread of either.
 */
export function commandNames(where: "dm" | "room", standing?: Standing, updates = false): string[] {
  const forAgents = Object.entries(AGENT_LINES).flatMap(([name, lines]) => (lines[where] === undefined ? [] : [name]));
  const forClient = CLIENT_COMMANDS.filter((name) => standing === undefined || (takes(name, updates) && offeredIn(name, standing)));
  return [...forAgents, ...forClient].map((name) => `/${name}`).sort((a, b) => a.localeCompare(b));
}

const isClientCommand = (name: string): name is ClientCommand => (CLIENT_COMMANDS as readonly string[]).includes(name);
const isAgentCommand = (name: string): name is AgentCommand => Object.hasOwn(AGENT_COMMANDS, name);

/** What a client does with a text written in a thread. */
export type Written =
  /** It is a message, or a command for agents: it is posted as it was written. */
  | { do: "post" }
  /** `/status` alone: the client reads how the agent or the room stands. */
  | { do: "status" }
  /** `/devices` alone: the client lists the person's devices. */
  | { do: "devices" }
  /** `/devices take back` and a device: the client takes back the device `device` names, by its label or ID. */
  | { do: "take-back"; device: string }
  /** `/model` alone: the client says which model the thread runs on. */
  | { do: "model" }
  /** `/rename` and a name: the client renames the thread, as it was typed. */
  | { do: "rename"; name: string }
  /** `/rename` alone: the client says what the thread is called, or offers to name it where it can. */
  | { do: "name" }
  /** `/archive` or `/unarchive`: the client archives the thread, or brings it back. */
  | { do: "archive"; archived: boolean }
  /** `/update` alone: the client puts the gateway's version on its machine. */
  | { do: "update" }
  /** It is posted nowhere, and the text goes back where it was typed. */
  | { do: "refuse"; notice: Notice };

/** What follows `/devices` to take a device back: the words and the device. */
const TAKE_BACK = /^take\s+back\s+(.+)$/isu;

/** A slash first, the name after it, and whatever follows the name. A name is made of what the names of the commands for agents are made of. */
const SLASH_FIRST = /^\s*\/([\p{L}\p{N}_-]*)(.*)$/su;

/**
 * What a client does with `text`, written in a thread of a DM or of a room
 * that stands as `standing`. A text whose first character that is not a space
 * is a slash is a command, always, and is never posted as an ordinary message:
 * a command for agents is posted as it was written, a command for the client is
 * acted on and posted nowhere, and a name that is no command there is refused,
 * saying which are, so that nothing is posted by mistake. To start a message with a slash, a person
 * wraps it in backticks or writes anything before it, as `@scout /stop` does,
 * which is posted and acted on by the agent.
 *
 * Three things set a command for agents apart from the rest. In a room, one
 * that is for nobody unless an agent is named, as the chat contract says of
 * each, is refused when it is written first, since it mentions nobody:
 * `@scout /model x` is how it is written there. In a room too, one written
 * after a name that is no member's is refused, since the agents would take it
 * for no one and the person would never know: `@scuot /stop` would stop
 * nobody. `members` are the names of the room's members, where the client
 * knows them. And `/model` alone in a DM is answered by the client, which can
 * see which model the thread runs on, and is not posted. With anything after
 * it, it is posted like any command for agents. `updates` says whether the
 * client updates its own machine, and so takes `/update`.
 */
export function writtenIn(text: string, where: "dm" | "room", standing: Standing, updates = false, members?: readonly string[]): Written {
  const found = SLASH_FIRST.exec(text);
  if (found === null) {
    const nobody = where === "room" && members !== undefined ? nobodyNamed(text, members) : undefined;
    return nobody === undefined ? { do: "post" } : { do: "refuse", notice: { kind: "no-member", written: nobody } };
  }
  const name = (found[1] ?? "").toLowerCase();
  const rest = (found[2] ?? "").trim();
  // A thread that is not started yet can't be renamed or archived, so those are no commands there.
  if (isClientCommand(name) && takes(name, updates) && (standing !== "new" || offeredIn(name, "new"))) return clientCommand(name, rest, standing);
  if (isAgentCommand(name)) {
    if (where === "room" && AGENT_COMMANDS[name].withoutMention === "nobody") return { do: "refuse", notice: { kind: "name-an-agent", command: name } };
    return name === "model" && where === "dm" && rest === "" ? { do: "model" } : { do: "post" };
  }
  const written = /^\s*(\S+)/.exec(text)?.[1] ?? "/";
  return { do: "refuse", notice: { kind: "no-command", written, commands: commandNames(where, standing, updates) } };
}

/** The first `@word` written before a command for agents in `text` that names none of `members`, as it was written, if there is one. `@all` names everyone. */
function nobodyNamed(text: string, members: readonly string[]): string | undefined {
  return agentCommandIn(text)?.named.find((word) => !members.some((member) => mentions(word, member)));
}

/** What a client does with one of its own commands, written with `rest` after it in a thread that stands as `standing`. Each has a case of its own. */
function clientCommand(name: ClientCommand, rest: string, standing: Standing): Written {
  switch (name) {
    case "devices": {
      if (rest === "") return { do: "devices" };
      const device = TAKE_BACK.exec(rest)?.[1]?.trim();
      return device === undefined || device === "" ? { do: "refuse", notice: { kind: "devices-usage", command: "/devices" } } : { do: "take-back", device };
    }
    case "status":
      return rest === "" ? { do: "status" } : { do: "refuse", notice: { kind: "takes-nothing", command: "/status" } };
    case "rename":
      return rest === "" ? { do: "name" } : { do: "rename", name: rest };
    case "archive":
    case "unarchive": {
      const archived = name === "archive";
      if (rest !== "") return { do: "refuse", notice: { kind: "takes-nothing", command: `/${name}` } };
      if (archived === (standing === "archived")) return { do: "refuse", notice: { kind: archived ? "archived-already" : "not-archived" } };
      return { do: "archive", archived };
    }
    case "update":
      return rest === "" ? { do: "update" } : { do: "refuse", notice: { kind: "takes-nothing", command: "/update" } };
  }
}

/** What a thread is named when `typed` names it: on one line with single spaces, and cut to the longest name chat keeps. Empty names nothing. */
export const typedName = (typed: string): string => cutEnd(singleSpaced(typed), MAX_NAME).trimEnd();

/** How the open thread stands, for which commands there are. One the client has not heard of from chat yet is taken as started and not archived. */
export function standingOf(model: Model): Standing {
  const { item } = model.open;
  if (item?.kind !== "thread" || item.thread === undefined) return "new";
  return openThreadOf(model)?.archived === true ? "archived" : "live";
}

/**
 * What a client does with `text`, written in the open thread, as `writtenIn`
 * has it for where the thread is and how it stands. `updates` says whether the
 * client updates its own machine.
 */
export function writtenInOpen(model: Model, text: string, updates = false): Written {
  const { item } = model.open;
  if (item?.kind !== "thread") return { do: "post" };
  const members = item.place.kind === "room" ? model.rooms[item.place.id]?.channel.members.map((member) => member.name) : undefined;
  return writtenIn(text, item.place.kind === "agent" ? "dm" : "room", standingOf(model), updates, members);
}
