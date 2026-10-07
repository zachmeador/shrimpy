import {
  connectGateway,
  entryTransports,
  formatAddress,
  type GatewayConnection,
  type Registration,
  type RosterEntry,
} from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";
import { START_EVERYTHING } from "./hints.ts";
import { shellsGateway, signInAsTheShellsAgent } from "./shell.ts";

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
 * Use a connection to the gateway for the length of `use`: the one on this
 * machine, or the one the shell's agent reaches when it is apart from the
 * gateway. There is no gateway on this machine when none runs, which gives
 * undefined. A gateway that an agent apart from it can't reach is an error that
 * says where. Aborting `signal` gives up, even on a gateway that has stopped
 * answering.
 */
export async function withGateway<T>(
  signal: AbortSignal | undefined,
  use: (gateway: GatewayConnection) => Promise<T>,
): Promise<T | undefined> {
  const apart = shellsGateway();
  let gateway: GatewayConnection;
  try {
    gateway =
      apart === undefined
        ? await connectLocalGateway({ signal })
        : await connectGateway({ transportFactory: entryTransports(apart).gateway, signal });
  } catch (error) {
    if (error instanceof GatewayNotRunningError) return undefined;
    if (apart !== undefined && signal?.aborted !== true) {
      throw new Error(`The gateway at ${formatAddress(apart)} can't be reached: ${(error as Error).message}`, {
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
 * Use a connection to the gateway, as withGateway has it, for the length of
 * `use`, as whoever runs the command: the agent whose shell it is, or the
 * person who runs the gateway anywhere else. With no gateway the error says
 * what to start.
 */
export async function withGatewayAsMe<T>(use: (gateway: GatewayConnection) => Promise<T>): Promise<T> {
  const used = await withGateway(undefined, async (gateway) => {
    await signInAsTheShellsAgent(gateway);
    return { value: await use(gateway) };
  });
  if (used === undefined) throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  return used.value;
}

/** What the gateway says, or undefined when no gateway is running on this machine. */
export function askGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  return withGateway(signal, async (gateway) => {
    // An agent apart from the gateway is nobody to it until it has signed in.
    if (shellsGateway() !== undefined) await signInAsTheShellsAgent(gateway);
    return view(gateway);
  });
}

/** Ask a connection what is running and who is on the roster. */
export async function view(gateway: GatewayConnection): Promise<GatewayView> {
  return { programs: await gateway.list(), members: await gateway.members(), version: await gateway.version() };
}
