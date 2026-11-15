import type { KeyObject } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse, STATUS_CODES } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import type { JsonValue } from "@earendil-works/chord/json";
import { type WebSocket, WebSocketServer } from "ws";
import { selfSignedCertificate } from "../tls/node.ts";
import { type Linked, linkOver, MAX_FRAME, textOf } from "./linked.node.ts";
import type { Place } from "./place.ts";

/**
 * Where to listen: a Unix socket's path, which the operating system guards, or
 * a host and a port, where every connection is TLS with a certificate made
 * around the private key `key`, which the other end checks by its fingerprint.
 */
export type ListenPlace = { readonly path: string } | { readonly host: string; readonly port: number; readonly key: KeyObject };

/**
 * What a listener does with a hello: the answer to send, and what takes the
 * link after it. With nothing to take it, the connection closes once the
 * answer is sent.
 */
export interface Greeted {
  readonly answer: JsonValue;
  readonly take?: (linked: Linked) => void;
}

export interface ListenOptions {
  /** How long a connection has to finish TLS, and then to send its hello. A quarter of a minute each if not given. */
  helloMs?: number;
  /** Told when `greet` or what takes a link throws, which drops the connection, and when the server fails after it listens. */
  onError?: (error: unknown) => void;
}

export interface Listener {
  /** Where it listens: the socket's path, or the host with the port it got. */
  readonly place: Place;
  /** Stop listening and drop every connection it took, linked or not. */
  close(): Promise<void>;
}

const HELLO_MS = 15_000;

/**
 * Listen at `place` for WebSockets, over TLS at an address. A request that
 * carries an `Origin` is a web page, which every browser says and nothing else
 * does, and is turned away. The first frame of a connection is its hello, as
 * JSON text, and `greet` decides what to answer and whether a link follows. It
 * is called once per connection and decides at once: the answer and the link
 * are made in the same turn, so two connections are never decided at the same
 * time and no frame after the hello is missed. A connection that sends
 * anything else first, or nothing in time, is dropped. A file left at a
 * socket's path is the caller's to remove first.
 */
export async function listen(
  place: ListenPlace,
  greet: (hello: unknown) => Greeted,
  options: ListenOptions = {},
): Promise<Listener> {
  const helloMs = options.helloMs ?? HELLO_MS;
  const sockets = new Set<WebSocket>();
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  const notFound = (_request: IncomingMessage, response: ServerResponse): void => void response.writeHead(404, { "Content-Length": 0 }).end();
  const http: Server =
    "path" in place
      ? createServer(notFound)
      : createTlsServer(
          {
            key: place.key.export({ type: "pkcs8", format: "pem" }),
            cert: selfSignedCertificate(place.key),
            minVersion: "TLSv1.3",
            handshakeTimeout: helloMs,
          },
          notFound,
        );
  let closing: Promise<void> | undefined;

  const greetOn = (socket: WebSocket): void => {
    if (closing !== undefined) {
      socket.terminate();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    // An error is followed by a close, which is all that matters here; without a listener it would end the process.
    socket.on("error", () => undefined);
    const late = setTimeout(() => socket.terminate(), helloMs);
    socket.once("close", () => clearTimeout(late));
    socket.once("message", (data, isBinary) => {
      clearTimeout(late);
      let hello: unknown;
      try {
        if (isBinary) throw new Error("A hello is text.");
        hello = JSON.parse(textOf(data));
      } catch {
        socket.terminate();
        return;
      }
      let greeted: Greeted;
      try {
        greeted = greet(hello);
      } catch (error) {
        socket.terminate();
        options.onError?.(error);
        return;
      }
      socket.send(JSON.stringify(greeted.answer));
      if (greeted.take === undefined) {
        socket.close();
        return;
      }
      try {
        greeted.take(linkOver(socket));
      } catch (error) {
        socket.terminate();
        options.onError?.(error);
      }
    });
  };

  http.on("upgrade", (request, socket: Duplex, head: Buffer) => {
    // Node stops listening for errors on a socket once it hands it over, and a client can reset it at any point.
    socket.on("error", () => undefined);
    if (request.headers.origin !== undefined) return refuse(socket, 403);
    webSockets.handleUpgrade(request, socket, head, greetOn);
  });
  await listening(http, place, options.onError);
  const address = http.address() as AddressInfo | string;
  const where: Place = "path" in place ? place : { host: place.host, port: (address as AddressInfo).port };

  return {
    place: where,
    close() {
      closing ??= (async () => {
        const stopped = new Promise<void>((resolve) => http.close(() => resolve()));
        http.closeAllConnections();
        for (const socket of sockets) socket.terminate();
        webSockets.close();
        await stopped;
      })();
      return closing;
    },
  };
}

function listening(http: Server, place: Place, onError: ((error: unknown) => void) | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    const ready = (): void => {
      http.off("error", reject);
      http.on("error", (error) => onError?.(error));
      resolve();
    };
    if ("path" in place) http.listen(place.path, ready);
    else http.listen(place.port, place.host, ready);
  });
}

function refuse(socket: Duplex, status: number): void {
  socket.end(`HTTP/1.1 ${String(status)} ${STATUS_CODES[status] ?? ""}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
