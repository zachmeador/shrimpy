import { parseArgs } from "node:util";
import { checkAgentName } from "../../contracts/agent/index.ts";
import { initHome, providerPaths } from "../../contracts/agent/node.ts";
import { type Link, readLink } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { gatewayOfItsOwn, homeInFolder, machineFolder, providersPath } from "../folder/index.ts";
import type { Io } from "../io/index.ts";
import { JoinFailedError, joinAsMachine, joinHome } from "../talk/index.ts";
import { checking, expectArguments, parsing } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";
import { folderDefault } from "./folder-default.ts";
import { printNext, type Step } from "./next.ts";

/** How long to wait for a gateway that does not answer, in milliseconds. */
const GIVE_UP_MS = 15_000;

const join: Command = {
  name: "join",
  usage: "<link>",
  summary:
    "With the link of an invitation, make an agent here that joins a gateway elsewhere, or make this machine one of yours.",
  details: [
    "Run this where the agent or the machine is to live, with the link that shrimpy invite printed. The link says " +
      "which it is for, and ends with the fingerprint of the gateway's key: the connection is encrypted, and " +
      "nothing is sent to a gateway whose key doesn't match it. Either way the invitation works once, for fifteen " +
      "minutes, and running this again with the same link is safe while the code is good. It says on standard " +
      "error whether the gateway runs another version of Shrimpy than this command, and gives up on a gateway that " +
      "does not answer within fifteen seconds.",
    "A link that names an agent, which shrimpy invite <name> printed on the gateway's machine, makes that agent's " +
      "home here: agents/<name> in your Shrimpy folder, which is ~/shrimpy or the folder SHRIMPY_DIR names. If " +
      "there is none, it is made as agent init <name> makes it, with no model; one that is there must be that " +
      "agent. This makes the agent's token, shows the gateway the name, the code and the token, and keeps the " +
      "gateway's address and the fingerprint of its key in the home, where shrimpy up finds them: the agent " +
      "connects to that gateway from then on, checking its key each time, and is talked to from the gateway's " +
      "machine. It says whether the gateway let the agent in. The invitation " +
      "works only for the name it was made for. A failure leaves a home that was just made. A home that has " +
      "joined a gateway already is refused, and the error names the file to delete to join anew.",
    "A link that names nobody, which shrimpy invite printed with no name, on the gateway's machine or on a " +
      "machine of yours that has joined, makes this machine one of yours. It makes a token, keeps it in " +
      "machine.json in your Shrimpy folder with the gateway's address and the fingerprint of its key, and shows " +
      "the gateway the code and the token. From then on the " +
      "commands that talk (run, threads, read, rooms and members) and the terminal that a bare shrimpy opens " +
      "reach that gateway as you, wherever it runs. A command about an agent's home, such as sessions or " +
      "triggers, still acts on the homes of this machine. It says whose machine this is now. A failure leaves the " +
      "token. A Shrimpy folder that has a gateway of its own is refused, since there you are the person who runs " +
      "the gateway already, and so is one that has joined already: the error names the file to delete to join " +
      "anew. Deleting that file is also how this machine leaves, and /devices take back in the terminal ends its " +
      "token at the gateway.",
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
  const link = checking(() => readLink(text));
  return link.name === null
    ? joinThisMachine(io, link, giveUpMs)
    : joinAsAgent(io, text, { ...link, name: link.name }, giveUpMs);
}

/** Make the agent the link names, with a home in the Shrimpy folder unless it has one, and join the gateway as it. */
async function joinAsAgent(io: Io, text: string, { name, address }: Link & { name: string }, giveUpMs: number): Promise<number> {
  checking(() => checkAgentName(name));
  const { home, exists } = homeInFolder(name);
  if (!exists) initHome(home, { name });
  const where = formatAddress(address);
  const joined = await joining({
    where,
    giveUpMs,
    stays: exists ? "" : `The agent's home, ${home}, was made and stays. `,
    join: (signal) => joinHome(home, text, { signal }),
  });

  warnIfVersionDiffers(io, "the gateway", joined.gatewayVersion);
  io.out(
    `${name} joined the gateway at ${where}. ` +
      (exists ? `Its home is ${home}.` : `Its home is ${home}, made just now with no model.`),
  );
  const steps: Step[] = [];
  if (folderDefault(providerPaths(providersPath()).defaultModel) === undefined) {
    steps.push(["Choose a model and sign in, which every agent started in this folder uses:", { run: "shrimpy login" }]);
  }
  steps.push([
    `If Shrimpy is running here, ${name} starts by itself in a few seconds. If it isn't, start Shrimpy:`,
    { run: "shrimpy up" },
    "It connects to the gateway by itself from then on, and you talk to it from the gateway's machine.",
  ]);
  printNext(io, steps);
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
  const joined = await joining({
    where,
    giveUpMs,
    join: (signal) => joinAsMachine(folder, link, { signal }),
  });

  warnIfVersionDiffers(io, "the gateway", joined.gatewayVersion);
  io.out(`This machine is ${joined.member.name}'s now, on the gateway at ${where}.`);
  io.out("Open the terminal with: shrimpy");
  return 0;
}

/**
 * Join the gateway at `where` with `join`, giving up on one that does not answer
 * within `giveUpMs`. Only a join that was tried, a `JoinFailedError`, can be
 * made again, so its failure says so, after what `stays` says was left; a link
 * that does not fit is said as it is.
 */
async function joining<T>(options: {
  where: string;
  giveUpMs: number;
  stays?: string;
  join: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const gaveUp = new AbortController();
  const timer = setTimeout(() => gaveUp.abort(), options.giveUpMs);
  try {
    return await options.join(gaveUp.signal);
  } catch (error) {
    if (!(error instanceof JoinFailedError)) throw error;
    const said = gaveUp.signal.aborted ? `The gateway at ${options.where} did not answer within fifteen seconds.` : asError(error).message;
    throw new Error(`${said}\n${options.stays ?? ""}Running this again with the same link is safe while the code is good.`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export const joinCommands: Command[] = [join];
