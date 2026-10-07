import {
  type Address,
  connectGateway,
  formatAddress,
  type GatewayConnection,
  type Registration,
  type RosterEntry,
} from "../../contracts/gateway/index.ts";
import { connectLocalGateway, entryTransports, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { START_EVERYTHING } from "./hints.ts";
import { type Me, me } from "./me.ts";

/** What the gateway says is running and who is on its roster. */
export interface GatewayView {
  /** Every program registered with it, oldest first. */
  programs: Registration[];
  /** Everyone on the roster, oldest first. */
  members: RosterEntry[];
  /** The version of Shrimpy the gateway runs. */
  version: string;
}

/**
 * Use a connection to the gateway at `entry` for the length of `use`, or the
 * one on this machine when there is none. There is no gateway on this machine
 * when none runs, which gives undefined. A gateway at an address that can't be
 * reached is an error that says where. Aborting `signal` gives up, even on a
 * gateway that has stopped answering.
 */
async function connectedTo<T>(
  entry: Address | undefined,
  signal: AbortSignal | undefined,
  use: (gateway: GatewayConnection) => Promise<T>,
): Promise<T | undefined> {
  let gateway: GatewayConnection;
  try {
    gateway =
      entry === undefined
        ? await connectLocalGateway({ signal })
        : await connectGateway({ transportFactory: entryTransports(entry).gateway, signal });
  } catch (error) {
    if (error instanceof GatewayNotRunningError) return undefined;
    if (entry !== undefined && signal?.aborted !== true) {
      throw new Error(`The gateway at ${formatAddress(entry)} can't be reached: ${(error as Error).message}`, {
        cause: error,
      });
    }
    throw error;
  }
  // Hanging up ends a question the gateway has stopped answering.
  const hangUp = (): void => void gateway.close();
  signal?.addEventListener("abort", hangUp, { once: true });
  try {
    return await use(gateway);
  } finally {
    signal?.removeEventListener("abort", hangUp);
    await gateway.close();
  }
}

/**
 * Use a connection to the gateway the command reaches for the length of `use`,
 * which is told who the command is: the one on this machine, or the one the
 * shell's agent, when it is apart from the gateway, or the person's machine,
 * when it has joined one, reaches over its entry. There is no gateway on this
 * machine when none runs, which gives undefined. A gateway that can't be
 * reached over the network is an error that says where. Aborting `signal` gives
 * up, even on a gateway that has stopped answering.
 */
export function withGateway<T>(
  signal: AbortSignal | undefined,
  use: (gateway: GatewayConnection, who: Me) => Promise<T>,
): Promise<T | undefined> {
  const who = me();
  return connectedTo(who.entry, signal, (gateway) => use(gateway, who));
}

/**
 * Use a connection to the gateway, as withGateway has it, for the length of
 * `use`, as whoever runs the command: the agent whose shell it is, the person
 * whose machine this is, or the person who runs the gateway anywhere else. With
 * no gateway the error says what to start.
 */
export async function withGatewayAsMe<T>(use: (gateway: GatewayConnection) => Promise<T>): Promise<T> {
  const used = await withGateway(undefined, async (gateway, who) => {
    await who.signIn(gateway);
    return { value: await use(gateway) };
  });
  if (used === undefined) throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  return used.value;
}

/** What the gateway the command reaches says, or undefined when no gateway is running on this machine. */
export function askGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  return withGateway(signal, async (gateway, who) => {
    // Over the network a connection is nobody until it has signed in.
    if (who.entry !== undefined) await who.signIn(gateway);
    return view(gateway);
  });
}

/**
 * What the gateway on this machine says, or undefined when none runs here:
 * whoever runs the command, and whatever the Shrimpy folder has joined. For a
 * command that starts what is missing on this machine.
 */
export function askLocalGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  return connectedTo(undefined, signal, view);
}

/** Ask a connection what is running and who is on the roster. */
export async function view(gateway: GatewayConnection): Promise<GatewayView> {
  return { programs: await gateway.list(), members: await gateway.members(), version: await gateway.version() };
}
