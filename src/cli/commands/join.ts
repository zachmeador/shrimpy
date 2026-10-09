import { parseArgs } from "node:util";
import { checkAgentName, initHome, JoinFailedError, type JoinedHome, joinHome, providerPaths } from "../../agent/index.ts";
import { formatAddress, type Link, readLink } from "../../contracts/gateway/index.ts";
import { joinAsMachine, type MachineJoined, MachineJoinFailedError } from "../../contracts/gateway/node.ts";
import { gatewayOfItsOwn, homeInFolder, machineFolder, providersPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { folderDefault } from "./folder-default.ts";

/** How long to wait for a gateway that does not answer, in milliseconds. */
const GIVE_UP_MS = 15_000;

const join: Command = {
  name: "join",
  usage: "<link>",
  summary:
    "With the link of an invitation, make an agent here that joins a gateway elsewhere, or make this machine one of yours.",
  details: [
    "Run this where the agent or the machine is to live, with the link that shrimpy invite printed on the gateway's " +
      "machine, or on a machine of yours that has joined. The link says which it is for. Either way the invitation " +
      "works once, for fifteen minutes, and running this again with the same link is safe while the code is good. " +
      "It says on standard error whether the gateway runs another version of Shrimpy than this command, and gives " +
      "up on a gateway that does not answer within fifteen seconds.",
    "A link that names an agent makes that agent's home here: agents/<name> in your Shrimpy folder, which is " +
      "~/shrimpy or the folder SHRIMPY_DIR names. If there is none, it is made as agent init <name> makes it, with " +
      "no model; one that is there must be that agent. This makes the agent's token, shows the gateway the name, " +
      "the code and the token, and keeps the gateway's address in the home, where shrimpy up finds it: the agent " +
      "connects to that gateway from then on, and is talked to from the gateway's machine. It says whether the " +
      "gateway let the agent in. The invitation works only for the name it was made for. A failure leaves a home " +
      "that was just made. A home that has joined a gateway already is refused, and the error names the file to " +
      "delete to join anew.",
    "A link that names nobody makes this machine one of yours. It makes a token, keeps it in machine.json in your " +
      "Shrimpy folder, and shows the gateway the code and the token. From then on the commands that talk (run, " +
      "threads, read, rooms and members) and the terminal that a bare shrimpy opens reach that gateway as you, " +
      "wherever it runs. A command about an agent's home, such as sessions or triggers, still acts on the homes of " +
      "this machine. It says whose machine this is now. A failure leaves the token. A Shrimpy folder that has a " +
      "gateway of its own is refused, since there you are the person who runs the gateway already, and so is one " +
      "that has joined already: the error names the file to delete to join anew. Deleting that file is also how " +
      "this machine leaves, though the gateway has no way yet to take the token back.",
  ].join("\n\n"),
  run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [text] = expectArguments(positionals, ["<link>"]);
    return joinByLink(io, text);
  },
};

/**
 * Join the gateway the link names: as the agent it names, with a home made here, or, when it names nobody, as the
 * person whose machine this is. It waits `giveUpMs` for a gateway that does not answer, which a test shortens.
 */
export async function joinByLink(io: Io, text: string, giveUpMs = GIVE_UP_MS): Promise<number> {
  let link: Link;
  try {
    link = readLink(text);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  return link.name === null
    ? joinThisMachine(io, link, giveUpMs)
    : joinAsAgent(io, text, { ...link, name: link.name }, giveUpMs);
}

/** Make the agent the link names, with a home in the Shrimpy folder unless it has one, and join the gateway as it. */
async function joinAsAgent(io: Io, text: string, { name, address }: Link & { name: string }, giveUpMs: number): Promise<number> {
  try {
    checkAgentName(name);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  const { home, exists } = homeInFolder(name);
  if (!exists) initHome(home, { name });
  const where = formatAddress(address);
  const gaveUp = new AbortController();
  const timer = setTimeout(() => gaveUp.abort(), giveUpMs);
  let joined: JoinedHome;
  try {
    joined = await joinHome(home, text, { signal: gaveUp.signal });
  } catch (error) {
    // Only an attempt that was made can be made again. A link that does not fit the home is said as it is.
    if (!(error instanceof JoinFailedError)) throw error;
    let said = error.message;
    if (gaveUp.signal.aborted) said = `The gateway at ${where} did not answer within fifteen seconds.`;
    const stays = exists ? "" : `The agent's home, ${home}, was made and stays. `;
    throw new Error(`${said}\n${stays}Running this again with the same link is safe while the code is good.`, { cause: error });
  } finally {
    clearTimeout(timer);
  }

  if (joined.gatewayVersion !== undefined) warnIfVersionDiffers(io, "the gateway", joined.gatewayVersion);
  io.out(
    `${name} joined the gateway at ${where}. ` +
      (exists ? `Its home is ${home}.` : `Its home is ${home}, made just now with no model.`),
  );
  io.out("");
  io.out("Next:");
  const steps: string[][] = [];
  if (folderDefault(providerPaths(providersPath()).defaultModel) === undefined) {
    steps.push([
      "Choose a model and sign in, which every agent started in this folder uses:",
      "     shrimpy login",
    ]);
  }
  steps.push([
    `If Shrimpy is running here, ${name} starts by itself in a few seconds. If it isn't, start Shrimpy:`,
    "     shrimpy up",
    "   It connects to the gateway by itself from then on, and you talk to it from the gateway's machine.",
  ]);
  steps.forEach(([first, ...rest], index) => {
    io.out(`  ${index + 1}. ${first}`);
    for (const line of rest) io.out(`  ${line}`);
  });
  return 0;
}

/** Join the gateway the link names as the person whose machine this is, and say so. */
async function joinThisMachine(io: Io, link: Link, giveUpMs: number): Promise<number> {
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
