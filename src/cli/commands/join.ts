import { parseArgs } from "node:util";
import { formatAddress, type Link, readLink } from "../../contracts/gateway/index.ts";
import { joinAsMachine, type MachineJoined, MachineJoinFailedError } from "../../contracts/gateway/node.ts";
import { gatewayOfItsOwn, machineFolder } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";

/** How long to wait for a gateway that does not answer, in milliseconds. */
const GIVE_UP_MS = 15_000;

const join: Command = {
  name: "join",
  usage: "<link>",
  summary: "Make this machine one of yours, with the link of an invitation from another machine of yours.",
  details: [
    "Run this on the machine that is to be yours, with the link that shrimpy members invite printed when it was " +
      "run with no name, on the gateway's machine or on a machine of yours that has joined. It makes a token, " +
      "keeps it in machine.json in your Shrimpy folder, which is ~/shrimpy or the folder SHRIMPY_DIR names, and " +
      "shows the gateway the code and the token.",
    "From then on the commands that talk (run, threads, read, rooms and members) and the terminal that a bare " +
      "shrimpy opens reach that gateway as you, wherever it runs. A command about an agent's home, such as " +
      "sessions or triggers, still acts on the homes of this machine.",
    "It says whose machine this is now, and on standard error whether the gateway runs another version of " +
      "Shrimpy than this command. It gives up on a gateway that does not answer within fifteen seconds. A failure " +
      "leaves the token, and running it again with the same link is safe while the code is good: an invitation " +
      "works once, for fifteen minutes.",
    "A link for an agent is refused, since shrimpy agent join takes that one. So is a Shrimpy folder that has a " +
      "gateway of its own, where you are the person who runs the gateway already, and one that has joined already: " +
      "the error names the file to delete to join anew. Deleting that file is also how this machine leaves, though " +
      "the gateway has no way yet to take the token back.",
  ].join("\n\n"),
  run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [text] = expectArguments(positionals, ["<link>"]);
    return joinThisMachine(io, text);
  },
};

/**
 * What the link says, or a usage error that says what is wrong with it: it is not
 * a link, or it is for an agent.
 */
function machineLinkIn(text: string): Link {
  let link: Link;
  try {
    link = readLink(text);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  if (link.name !== null) {
    throw new UsageError(
      `That link is for an agent called ${link.name}, and not for another machine of yours. Use shrimpy agent join <link> for it.`,
    );
  }
  return link;
}

/**
 * Join the gateway the link names as the person whose machine this is, and say so.
 * It waits `giveUpMs` for a gateway that does not answer, which a test shortens.
 */
export async function joinThisMachine(io: Io, text: string, giveUpMs = GIVE_UP_MS): Promise<number> {
  const link = machineLinkIn(text);
  const folder = machineFolder();
  const own = gatewayOfItsOwn();
  if (own !== undefined) {
    throw new Error(
      `This Shrimpy folder has a gateway of its own, in ${own}, and on it you are the person who runs it already, so there ` +
        "is nothing to join. Run this on another machine.",
    );
  }

  const where = formatAddress(link.address);
  const gaveUp = new AbortController();
  const timer = setTimeout(() => gaveUp.abort(), giveUpMs);
  let joined: MachineJoined;
  try {
    joined = await joinAsMachine(folder, link, { signal: gaveUp.signal });
  } catch (error) {
    // Only an attempt that was made can be made again. A link that does not fit this folder is said as it is.
    if (!(error instanceof MachineJoinFailedError)) throw error;
    const said = gaveUp.signal.aborted ? `The gateway at ${where} did not answer within fifteen seconds.` : error.message;
    throw new Error(`${said}\nRunning this again with the same link is safe while the code is good.`, { cause: error });
  } finally {
    clearTimeout(timer);
  }

  if (joined.gatewayVersion !== undefined) warnIfVersionDiffers(io, "the gateway", joined.gatewayVersion);
  io.out(`This machine is ${joined.member.name}'s now, on the gateway at ${where}.`);
  io.out("Open the terminal with: shrimpy");
  return 0;
}

export const joinCommands: Command[] = [join];
