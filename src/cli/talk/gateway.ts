import type { GatewayConnection, Registration, RosterEntry } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";

/** What the gateway on this machine says is running and who is on its roster. */
export interface GatewayView {
  /** Every program registered with it, oldest first. */
  programs: Registration[];
  /** Everyone on the roster, oldest first. */
  members: RosterEntry[];
  /** The version of Shrimpy the gateway runs. */
  version: string;
}

/**
 * Use a connection to the gateway on this machine for the length of `use`, or
 * get undefined when there is no gateway. Aborting `signal` gives up, even on a
 * gateway that has stopped answering.
 */
export async function withGateway<T>(
  signal: AbortSignal | undefined,
  use: (gateway: GatewayConnection) => Promise<T>,
): Promise<T | undefined> {
  let gateway: GatewayConnection;
  try {
    gateway = await connectLocalGateway({ signal });
  } catch (error) {
    if (error instanceof GatewayNotRunningError) return undefined;
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

/** What the gateway on this machine says, or undefined when no gateway is running. */
export function askGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  return withGateway(signal, (gateway) => view(gateway));
}

/** Ask a connection what is running and who is on the roster. */
export async function view(gateway: GatewayConnection): Promise<GatewayView> {
  return { programs: await gateway.list(), members: await gateway.members(), version: await gateway.version() };
}
