import { createServer, type IncomingMessage, type Server, STATUS_CODES } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { Duplex } from "node:stream";
import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { createWebSocketStream, WebSocketServer } from "ws";
import { type Address, parseWebSocketRequest, type ProgramName } from "../../contracts/gateway/index.ts";
import { bridge, connectUpstream } from "../pipe/index.ts";

export interface EntryOptions {
  /** The addresses to listen on. A port of 0 picks a free one. */
  addresses: Address[];
  /** The Unix socket that `/ws/gateway` is piped to. */
  gatewaySocket: string;
  /** Whether `ticket` is good for `target` now. Nothing is spent: the program spends it when the client hands it over. */
  good(ticket: string, target: ProgramName): boolean;
  /** The socket the gateway pipes connections to `target` to, or undefined when it has none. */
  resolve(target: ProgramName): string | undefined;
}

export interface Entry {
  /** The addresses it listens on, in the order they were asked for, each with the port it got. */
  readonly addresses: Address[];
  /** Stop listening and close every open pipe. */
  close(): Promise<void>;
}

/**
 * Open the network entry on each address: an HTTP server that does nothing but
 * pipe a WebSocket, to the gateway itself or to a program that is registered.
 * No files are served. The gateway's own pipe is the way in for a connection
 * from apart, which signs in or joins before it does anything else, and a way
 * through to a program opens only with a ticket that is good for that program.
 * A request that carries an `Origin` is a web page, which has no business
 * here, and is refused.
 */
export async function startEntry(options: EntryOptions): Promise<Entry> {
  // One protocol frame plus its length prefix is the most a client sends in one message.
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: DEFAULT_MAX_FRAME_LENGTH + 4,
  });
  const upstreams = new Set<Socket>();
  const servers: Server[] = [];
  let closing: Promise<void> | undefined;

  async function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // Browsers always send an Origin, and a client that is not a web page sends none.
    if (request.headers.origin !== undefined) return refuse(socket, 403);

    const asked = parseWebSocketRequest(request.url ?? "");
    if (asked === undefined) return refuse(socket, 404);
    let path: string | undefined;
    if (asked.target === "gateway") {
      path = options.gatewaySocket;
    } else {
      if (asked.ticket === undefined || !options.good(asked.ticket, asked.target)) return refuse(socket, 403);
      path = options.resolve(asked.target);
    }
    if (path === undefined) return refuse(socket, 404);

    // Connect before accepting, so a program that went away is a refusal rather than a pipe that dies at once.
    const upstream = await connectUpstream(path).catch(() => undefined);
    if (upstream === undefined) return refuse(socket, 502);
    if (closing !== undefined) {
      upstream.destroy();
      socket.destroy();
      return;
    }
    upstreams.add(upstream);
    upstream.once("close", () => upstreams.delete(upstream));
    // The handshake can still fail, and then no bridge ever owns the upstream.
    socket.once("close", () => upstream.destroy());
    webSockets.handleUpgrade(request, socket, head, (ws) => bridge(createWebSocketStream(ws), upstream));
  }

  const open = async ({ host, port }: Address): Promise<Address> => {
    const http = createServer((_request, response) => response.writeHead(404, { "Content-Length": 0 }).end());
    http.on("upgrade", (request, socket, head) => {
      // Node stops listening for errors on a socket once it hands it over, and a
      // client can reset the connection at any point before the pipe takes it.
      socket.on("error", () => undefined);
      upgrade(request, socket, head).catch(() => socket.destroy());
    });
    servers.push(http);
    await listen(http, host, port);
    return { host, port: (http.address() as AddressInfo).port };
  };

  const close = (): Promise<void> => {
    closing ??= (async () => {
      const stopped = servers.splice(0).map(
        (http) =>
          new Promise<void>((done) => {
            http.close(() => done());
            http.closeAllConnections();
          }),
      );
      for (const upstream of upstreams) upstream.destroy();
      for (const client of webSockets.clients) client.terminate();
      webSockets.close();
      await Promise.all(stopped);
    })();
    return closing;
  };

  try {
    const addresses: Address[] = [];
    for (const address of options.addresses) addresses.push(await open(address));
    return { addresses, close };
  } catch (error) {
    await close();
    throw error;
  }
}

function listen(http: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, host, () => {
      http.off("error", reject);
      http.on("error", (error) => console.error("[gateway]", error.message));
      resolve();
    });
  });
}

function refuse(socket: Duplex, status: number): void {
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ""}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}
