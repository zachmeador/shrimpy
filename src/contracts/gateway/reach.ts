import type { ByteTransportFactory } from "@earendil-works/pi-client";
import type { GatewayConnection } from "./connect.ts";
import type { ProgramName } from "./services.ts";

/**
 * How to open a byte connection to a gateway and, through it, to a program it
 * has registered. A program is reached by its name over one of these: on this
 * machine the gateway's Unix sockets, from a browser its WebSocket entry, and
 * from another machine, another user or a container the gateway's network
 * entry. What each does with the name is the gateway's own business, and a
 * caller never sees it.
 */
export interface Transports {
  /** To the gateway itself. */
  gateway: ByteTransportFactory;
  /**
   * Through the gateway to the program called `target`. The ticket is the one
   * the client was given for it, which the network entry looks at before it
   * opens the way, and the program spends. The ways on this machine ignore it.
   */
  program(target: ProgramName, ticket: string): ByteTransportFactory;
}

/**
 * Connect to a program by its name, through the gateway, whatever machine it is
 * on: ask the gateway for a ticket, open the program's own connection over the
 * way the gateway offers to it, which on the network entry opens only with the
 * ticket, and hand over the ticket, which every program that accepts
 * connections asks for before anything else. The program asks the
 * gateway whose it is, so nobody says who they are. `connect` is the program's
 * contract opening its connection (`connectChat`, `connectAgent`), and `enter`
 * is that contract's way to hand the ticket over, answering whom the program
 * took the caller for. A connection whose ticket is refused is closed. Aborting
 * `signal` gives up on a program that is not answering.
 */
export async function reachProgram<C extends { close(): Promise<void> }, Entered>(options: {
  /** Where the ticket comes from: a connection to the gateway, signed in as whoever is asking if they are not the person who runs it. */
  gateway: Pick<GatewayConnection, "ticket">;
  transports: Pick<Transports, "program">;
  target: ProgramName;
  connect(options: { serverId: string; transportFactory: ByteTransportFactory; signal?: AbortSignal }): Promise<C>;
  enter(connection: C, ticket: string, signal?: AbortSignal): Promise<Entered>;
  signal?: AbortSignal;
}): Promise<{ connection: C; entered: Entered }> {
  const { target, signal } = options;
  const ticket = await options.gateway.ticket(target);
  const connection = await options.connect({
    serverId: ticket.serverId,
    transportFactory: options.transports.program(target, ticket.value),
    signal,
  });
  try {
    return { connection, entered: await options.enter(connection, ticket.value, signal) };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
}
