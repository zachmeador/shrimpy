import type { GatewayConnection, Registration } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../../contracts/gateway/node.ts";

/** What the gateway on this machine says is running. */
export interface GatewayView {
  /** Every program registered with it, oldest first. */
  programs: Registration[];
  /** The version of Shrimpy the gateway runs. */
  version: string;
}

/**
 * Ask the gateway on this machine what is running, or say there is no gateway.
 * Aborting `signal` gives up, even on a gateway that has stopped answering.
 */
export async function askGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
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
    return { programs: await gateway.list(), version: await gateway.version() };
  } finally {
    signal?.removeEventListener("abort", hangUp);
    await gateway.close();
  }
}
