import { createServer, type IncomingMessage, type Server, STATUS_CODES } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { createWebSocketStream, type WebSocket, WebSocketServer } from "ws";
import {
  type Address,
  formatAddress,
  parseAnswerPath,
  parseWebSocketRequest,
  type ProgramName,
} from "../../contracts/gateway/index.ts";
import { bridge, connectUpstream } from "../pipe/index.ts";

/** How long a connection may answer no ping before the entry lets go of it. */
const SILENCE_MS = 30_000;

export interface EntryOptions {
  /** The addresses to listen on. A port of 0 picks a free one. */
  addresses: Address[];
  /** The Unix socket that `/ws/gateway` is piped to. */
  gatewaySocket: string;
  /** Whether `ticket` is good for `target` now. Nothing is spent: the program spends it when the client hands it over. */
  good(ticket: string, target: ProgramName): boolean;
  /**
   * Open a connection to the newest program registered under `target`:
   * undefined when there is none. The answer fails when the connection can't be
   * made, and may take a while, since an agent apart from the gateway is called
   * and answers by connecting out. Aborting `signal` gives up, because whoever
   * asked has gone.
   */
  reach(target: ProgramName, signal: AbortSignal): Promise<Duplex> | undefined;
  /**
   * Take the call `call` for answering, which spends its ID, or undefined when
   * no call waits under it. `arrive` is given the connection that answers it,
   * and `abandon` is told when that connection did not open.
   */
  answer(call: string): { arrive(connection: Duplex): void; abandon(): void } | undefined;
  /**
   * How long a connection may stay silent, answering none of the pings the
   * entry sends it, before the entry lets go of it, in milliseconds. Half a
   * minute if not given. Tests shorten it.
   */
  silenceMs?: number;
}

export interface Entry {
  /** The addresses it listens on, in the order they were asked for, each with the port it got. */
  readonly addresses: Address[];
  /** Stop listening and close every open pipe. */
  close(): Promise<void>;
}

/**
 * Open the network entry on each address: an HTTP server that does nothing but
 * pipe a WebSocket, to the gateway itself or to a program that is registered,
 * and take the connection an agent apart opens to answer a call. No files are
 * served. The gateway's own pipe is the way in for a connection from apart,
 * which signs in or joins before it does anything else, and a way through to a
 * program opens only with a ticket that is good for that program, once the
 * program is reached. A connection that answers a call opens only for an ID of
 * a call that is waiting, once. A request that carries an `Origin` is a web
 * page, which has no business here, and is refused. Every connection it holds,
 * to the gateway, through to a program or answering a call, is pinged, and one
 * that answers none for a while is let go of, since a connection can die with
 * no word. What was joined to it ends with it.
 */
export async function startEntry(options: EntryOptions): Promise<Entry> {
  // One protocol frame plus its length prefix is the most a client sends in one message.
  const webSockets = new WebSocketServer({
    noServer: true,
    maxPayload: DEFAULT_MAX_FRAME_LENGTH + 4,
  });
  const upstreams = new Set<Duplex>();
  const servers: Server[] = [];
  let closing: Promise<void> | undefined;

  // When each connection last answered a ping, which is when it opened until it does.
  const heard = new WeakMap<WebSocket, number>();
  const silenceMs = options.silenceMs ?? SILENCE_MS;
  const pingMs = Math.max(1, Math.floor(silenceMs / 3));
  let lastRound = Date.now();
  const pinging = setInterval(() => {
    const now = Date.now();
    // A gateway that was suspended, or too busy to run its timers, has not been listening, so nobody could answer it.
    const late = now - lastRound > 2 * pingMs;
    lastRound = now;
    for (const ws of webSockets.clients) {
      // The same holds for a connection that the entry stopped reading, because what it sent is waiting to be taken.
      if (late || ws.isPaused) heard.set(ws, now);
      if (now - (heard.get(ws) ?? now) >= silenceMs) ws.terminate();
      else ws.ping();
    }
  }, pingMs);
  pinging.unref();

  /** Take the handshake in as a WebSocket, which from then on is pinged. */
  function accept(request: IncomingMessage, socket: Duplex, head: Buffer, use: (ws: WebSocket) => void): void {
    webSockets.handleUpgrade(request, socket, head, (ws) => {
      heard.set(ws, Date.now());
      ws.on("pong", () => heard.set(ws, Date.now()));
      use(ws);
    });
  }

  /** An agent opens this to answer a call. Its ID is what lets it in, and is good once. */
  function answer(call: string, request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (closing !== undefined) return void socket.destroy();
    const answering = options.answer(call);
    if (answering === undefined) return refuse(socket, 403);
    // The handshake can still fail, and then no connection ever arrives.
    socket.once("close", () => answering.abandon());
    accept(request, socket, head, (ws) => answering.arrive(createWebSocketStream(ws)));
  }

  async function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // Browsers always send an Origin, and a client that is not a web page sends none.
    if (request.headers.origin !== undefined) return refuse(socket, 403);

    const [path = ""] = (request.url ?? "").split("?", 1);
    const call = parseAnswerPath(path);
    if (call !== undefined) return answer(call, request, socket, head);

    const asked = parseWebSocketRequest(request.url ?? "");
    if (asked === undefined) return refuse(socket, 404);
    // A client that goes while it waits for the program ends the call that was made for it. This server lets a
    // connection stay half open, so one that went has ended before it has closed.
    const gone = new AbortController();
    socket.once("end", () => gone.abort());
    socket.once("close", () => gone.abort());
    let reaching: Promise<Duplex> | undefined;
    if (asked.target === "gateway") {
      reaching = connectUpstream(options.gatewaySocket);
    } else {
      if (asked.ticket === undefined || !options.good(asked.ticket, asked.target)) return refuse(socket, 403);
      reaching = options.reach(asked.target, gone.signal);
    }
    if (reaching === undefined) return refuse(socket, 404);

    // Reach the program before accepting, so one that went away, or an agent that did not answer, is a refusal rather than a pipe that dies at once.
    const upstream = await reaching.catch(() => undefined);
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
    accept(request, socket, head, (ws) => bridge(createWebSocketStream(ws), upstream));
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
    try {
      await listen(http, host, port);
    } catch (error) {
      throw cannotListen({ host, port }, error);
    }
    return { host, port: (http.address() as AddressInfo).port };
  };

  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(pinging);
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

/** Why the gateway could not listen on `address`: which address, and the reason in plain words. */
function cannotListen(address: Address, cause: unknown): Error {
  const { code, message } = cause as NodeJS.ErrnoException;
  const why =
    code === "EADDRINUSE"
      ? "another program is using that port"
      : code === "EADDRNOTAVAIL"
        ? "this machine has no such address"
        : code === "EACCES"
          ? "this user may not listen on that port"
          : message;
  return new Error(`The gateway can't listen on ${formatAddress(address)}: ${why}.`, { cause });
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
