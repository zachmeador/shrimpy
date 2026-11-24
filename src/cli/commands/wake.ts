import { parseArgs } from "node:util";
import { DEFAULT_WAKE_POLICY, isWakePolicy, WAKE_POLICIES, type WakePolicy } from "../../contracts/agent/index.ts";
import { roomLabel } from "../../contracts/chat/index.ts";
import { loadHome, readWake, saveWake } from "../../contracts/agent/node.ts";
import { asError } from "../../lib/errors/index.ts";
import { listed } from "../../lib/text/index.ts";
import type { Io } from "../io/index.ts";
import { roomNamed, roomNameWritten } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { asTheAgent } from "./as-the-agent.ts";
import type { Command } from "./command.ts";
import { toldOfChange } from "./reloaded.ts";
import {
  ABOUT_ANOTHER_AGENT,
  AGENT_OPTION,
  agentToActOn,
  type AtHome,
  atHome,
  command,
  ITS_FILES,
  mayActOn,
  WHICH_AGENT,
} from "./which-agent.ts";

/** The policies as a sentence gives them: "none, mentions, people or all". */
const POLICIES = listed(WAKE_POLICIES, "or");

/** What each policy does, in the words the help and the answer to setting one use. */
const MEANING: Record<WakePolicy, string> = {
  none: "nothing in the room wakes the agent.",
  mentions: "a message that mentions the agent, or says @all, wakes it, and so does an answer to a message of its own.",
  people: "as mentions, and a message a person writes in the room that mentions nobody wakes it too: it is for every agent there.",
  all: "every message in the room wakes the agent, whoever wrote it, except its own.",
};

/**
 * Check, before the room is written down, that the agent is in it, the way the
 * agent can say: it is the only one that can ask chat what its rooms are. Run
 * anywhere else, or with chat out of reach, this says the room was not checked
 * and carries on, since a name that is nobody's does no harm. Gives the room's
 * name as chat has it when it could be checked, and as it was written when not.
 */
async function checkRoom(io: Io, target: AtHome, written: string): Promise<string> {
  const name = roomNameWritten(written).trim();
  const unchecked = { what: `The room ${roomLabel(name)}`, only: "which rooms it is in" };
  const room = await asTheAgent(io, target, unchecked, (reached) => {
    try {
      return roomNamed(reached.chat.channels.value, written);
    } catch (error) {
      throw new UsageError(`Nothing was written. ${asError(error).message}`);
    }
  });
  return room?.name ?? name;
}

const wake: Command = {
  name: "wake",
  usage: "[<room> <policy>] [--agent <agent>]",
  summary: "Choose what wakes an agent in a room, or list what is set.",
  details: [
    "An agent is woken in a DM by every message from the other member. In a room, what wakes it is the room's " +
      "policy, which this sets:",
    "",
    ...WAKE_POLICIES.map((policy) => `  ${policy.padEnd(10)}${MEANING[policy]}${policy === DEFAULT_WAKE_POLICY ? " This is the default." : ""}`),
    "",
    "Whatever the policy, except none, a reaction to a message the agent wrote wakes it too. Name the room as " +
      '#name, in quotes, or as its name alone: a shell treats an unquoted # as the start of a comment, so ' +
      '`shrimpy wake #ops all` would only list. With no room and policy, this lists the rooms that are set.',
    "",
    "The choice is kept in wake.json in the agent's home. A running agent is told to read its files again, and " +
      "one that is not running reads the file when it starts.",
    "",
    `${WHICH_AGENT} ${ITS_FILES} ${ABOUT_ANOTHER_AGENT}`,
  ].join("\n"),
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const target = await atHome(agentToActOn(values.agent));
    if (positionals.length === 0) {
      await mayActOn(target, "Looking at what wakes another agent");
      return list(io, target);
    }
    if (positionals.length === 1) throw new UsageError(`Missing <policy>: ${POLICIES}.`);
    const [written, policy] = expectArguments(positionals, ["<room>", "<policy>"]);
    if (!isWakePolicy(policy)) {
      throw new UsageError(`The policy is ${POLICIES}, not ${policy}. shrimpy wake --help says what each does.`);
    }
    await mayActOn(target, "Choosing what wakes another agent");
    const room = await checkRoom(io, target, written);
    const { file } = await saveWake(target.home, room, policy);
    io.out(`Set ${roomLabel(room)} to ${policy}: ${MEANING[policy]} Written to ${file}.`);
    await toldOfChange(io, target);
    return 0;
  },
};

/** What the home's wake file sets, one room to a line, and what every other room has. */
async function list(io: Io, target: AtHome): Promise<number> {
  const read = await readWake(loadHome(target.home).paths);
  if (read.kind === "left out") {
    io.err(`${read.leftOut.file} can't be used: ${read.leftOut.reason}. Until it is fixed the agent keeps what it last read.`);
    return 1;
  }
  const rooms = Object.entries(read.settings);
  if (rooms.length === 0) {
    io.out(`No room is set, so every room has the default, ${DEFAULT_WAKE_POLICY}. Set one with: ${command(target, 'wake "#ops" all')}`);
    return 0;
  }
  const width = Math.max(...rooms.map(([room]) => roomLabel(room).length));
  for (const [room, policy] of rooms) io.out(`${roomLabel(room).padEnd(width)}  ${policy}`);
  io.out(`Every other room has the default, ${DEFAULT_WAKE_POLICY}.`);
  return 0;
}

export const wakeCommands: Command[] = [wake];
