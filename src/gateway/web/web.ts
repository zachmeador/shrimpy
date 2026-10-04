import { createServer, type IncomingMessage, type Server, STATUS_CODES } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import type { Duplex } from "node:stream";
import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { createWebSocketStream, WebSocketServer } from "ws";
import { parseWebSocketPath, type WebTarget } from "../../contracts/gateway/index.ts";
import { bridge, connectUpstream } from "../pipe/index.ts";
import { isOwnOrigin } from "./origin.ts";
import { staticFiles } from "./static.ts";

/** Loopback only. Nothing authenticates a connection to the browser entry yet. */
const HOST = "127.0.0.1";

export interface WebOptions {
  /** The port to listen on, on loopback. 0 picks a free one. */
  port: number;
  /** Serve the files in this directory, for the web client. */
  staticDir?: string;
}

export interface WebEntry {
  /** The port the entry listens on. */
  readonly port: number;
  /** Stop listening and close every open pipe. */
  close(): Promise<void>;
}

/**
 * Open the browser entry. `resolve` turns a target into the Unix socket to
 * pipe to, or undefined when the target is not running.
 */
export async function startWeb(
  options: WebOptions,
  resolve: (target: WebTarget) => string | undefined,
): Promise<WebEntry> {
  const files = options.staticDir === undefined ? undefined : await staticFiles(options.staticDir);
  // One protocol frame plus its length prefix is the most a client sends in one message.
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: DEFAULT_MAX_FRAME_LENGTH + 4,
  });
  const upstreams = new Set<Socket>();
  let closing: Promise<void> | undefined;

  const http = createServer((request, response) => {
    if (files === undefined) response.writeHead(404, { "Content-Length": 0 }).end();
    else void files.serve(request, response);
  });
  const ownPort = (): number => (http.address() as AddressInfo).port;

  async function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // A client with no Origin is not a web page: browsers always send one.
    const origin = request.headers.origin;
    if (origin !== undefined && !isOwnOrigin(origin, ownPort())) return refuse(socket, 403);

    const target = parseWebSocketPath((request.url ?? "").split("?", 1)[0] ?? "");
    const path = target === undefined ? undefined : resolve(target);
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

  http.on("upgrade", (request, socket, head) => {
    // Node stops listening for errors on a socket once it hands it over, and a
    // client can reset the connection at any point before the pipe takes it.
    socket.on("error", () => undefined);
    upgrade(request, socket, head).catch(() => socket.destroy());
  });
  await listen(http, options.port);

  return {
    port: ownPort(),
    close() {
      closing ??= (async () => {
        const stopped = new Promise<void>((done) => http.close(() => done()));
        http.closeAllConnections();
        for (const upstream of upstreams) upstream.destroy();
        for (const client of webSockets.clients) client.terminate();
        webSockets.close();
        await stopped;
      })();
      return closing;
    },
  };
}

function listen(http: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, HOST, () => {
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
