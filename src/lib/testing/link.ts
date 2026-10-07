import { connect, createServer, type Server, type Socket } from "node:net";
import type { TestContext } from "node:test";
import { stopAfter } from "./cleanup.ts";

/** Where something listens: a host and a port. */
interface Where {
  host: string;
  port: number;
}

export interface QuietLink {
  /** Where to connect, in place of the server's own address. */
  readonly address: Where;
  /**
   * From now on the link passes nothing either way, and closes nothing for the
   * client: every connection it held goes quiet and stays open, and one made
   * while it is quiet is taken and never answered. Its side towards the server is
   * closed at once for what it held, as the server does when a client has been
   * silent too long, and the client is told nothing, as a network that died
   * tells nobody.
   */
  silence(): void;
  /** Connections made from now on pass as they did. What went quiet stays quiet for good. */
  restore(): void;
}

/**
 * A link between a client and the server at `to` that can go quiet without
 * closing, which a loopback connection never does by itself and a real
 * network does. It is for a test of a client that has to notice that for itself.
 * It is closed when the test ends.
 */
export async function startQuietLink(t: TestContext, to: Where): Promise<QuietLink> {
  const sockets = new Set<Socket>();
  /** The clients it passes for, each with its connection to the server. */
  const passing = new Set<{ client: Socket; server: Socket }>();
  let quiet = false;

  const keep = (socket: Socket): Socket => {
    sockets.add(socket);
    // A connection that fails or is reset is somebody else's business here.
    socket.on("error", () => undefined);
    socket.once("close", () => sockets.delete(socket));
    return socket;
  };
  /** Take what a client says and say nothing back. */
  const hold = (client: Socket): void => void client.on("data", () => undefined);

  const server: Server = createServer((accepted) => {
    const client = keep(accepted);
    if (quiet) return hold(client);
    const toServer = keep(connect(to));
    const pair = { client, server: toServer };
    passing.add(pair);
    client.pipe(toServer);
    toServer.pipe(client);
    const done = (): void => void passing.delete(pair);
    client.once("close", done);
    toServer.once("close", done);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The link is not listening on a port.");
  stopAfter(t, async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  return {
    address: { host: "127.0.0.1", port: address.port },
    silence() {
      quiet = true;
      for (const { client, server: toServer } of passing) {
        client.unpipe(toServer);
        toServer.unpipe(client);
        toServer.destroy();
        hold(client);
      }
      passing.clear();
    },
    restore() {
      quiet = false;
    },
  };
}
