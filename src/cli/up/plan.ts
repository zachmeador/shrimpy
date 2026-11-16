import { join } from "node:path";
import { readMembership } from "../../contracts/agent/node.ts";
import type { Address } from "../../contracts/gateway/index.ts";
import { keptListenAddresses } from "../../contracts/gateway/node.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { allHomes, folderPath, homeNamed } from "../folder/index.ts";
import { askLocalGateway } from "../talk/index.ts";
import { runningAgent } from "./agents.ts";

export interface Plan {
  homes: string[];
  /**
   * The gateway and the chat server this starts beside the agents: where they keep their data, each in a folder of
   * its own, and the addresses `--listen` gave the gateway, when it gave any. None when every agent belongs to a
   * gateway elsewhere, and nothing is told to listen.
   */
  here: { data: string; listen: Address[] | undefined } | undefined;
  /** The gateways the agents belong to, when they all belong to one elsewhere. */
  elsewhere: Address[];
  /** Whether no agents were named, so that this keeps running the homes of the Shrimpy folder and not only starts them. */
  follow: boolean;
}

/**
 * What `up` starts for the agents it is told to start, or every agent of the Shrimpy folder when it is told none,
 * the data directory it is given and the addresses it is told to listen on: undefined when there is nothing to
 * start. It only reads. `dataFolder` is where the gateway and the chat server keep their data when no directory
 * is given.
 */
export function planUp(
  named: string[],
  given: string | undefined,
  listen: Address[] | undefined,
  dataFolder: () => string,
): Plan | undefined {
  const homes = named.length === 0 ? allHomes() : named.map(homeNamed);
  // Nothing is made until there is something to start, so where the gateway keeps its data is only read.
  const told = listen !== undefined || keptListenAddresses(join(given ?? folderPath(), "gateway")).length > 0;
  if (homes.length === 0 && !told) return undefined;
  const follow = named.length === 0;
  // Agents that joined a gateway elsewhere have no use for one here, unless this is told to listen for others.
  const elsewhere = homes.flatMap((home) => readMembership(home)?.gateway ?? []);
  if (homes.length > 0 && elsewhere.length === homes.length && !told) {
    return { homes, here: undefined, elsewhere: distinct(elsewhere), follow };
  }
  return { homes, here: { data: given ?? dataFolder(), listen }, elsewhere: [], follow };
}

/** Whether everything `plan` starts is running already, so that another `up` would find nothing to start. */
export async function alreadyRunning(plan: Plan): Promise<boolean> {
  if (plan.here !== undefined) {
    const found = await askLocalGateway();
    if (found === undefined || !found.programs.some((program) => program.kind === "chat")) return false;
  }
  for (const home of plan.homes) {
    if ((await runningAgent(home)) === undefined) return false;
  }
  return true;
}

/** The addresses with none twice. */
const distinct = (addresses: Address[]): Address[] => [
  ...new Map(addresses.map((address) => [formatAddress(address), address])).values(),
];
