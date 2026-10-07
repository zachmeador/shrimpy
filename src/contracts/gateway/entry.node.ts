import type { ByteTransport, ByteTransportFactory } from "@earendil-works/pi-client";
import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { WebSocket } from "ws";
import { formatAddress } from "./address.ts";
import { webSocketPath } from "./endpoint.ts";
import type { Transports } from "./reach.ts";
import type { Address } from "./services.ts";

/**
 * The ways to reach the gateway at `address` and the programs registered with
 * it, over its network entry: for an agent apart from the gateway, such as one
 * under another user or on another machine, and for a command in that agent's
 * shell. The way to a program carries the ticket the client was given for it.
 * Only a program that is not a web page comes in here, since the entry refuses
 * a request that says it comes from one, so these are made with the `ws`
 * package, which can drop a connection at once. The platform's WebSocket, which
 * is all a browser has, can't: it has to finish a closing handshake, which a
 * peer that died never does, and the connection and the process that holds it
 * stay until the operating system gives up.
 */
export function entryTransports(address: Address): Transports {
  const url = (path: string): string => `ws://${formatAddress(address)}${path}`;
  return {
    gateway: socketTransport(url(webSocketPath("gateway"))),
    program: (target, ticket) => socketTransport(url(webSocketPath(target, ticket))),
  };
}

/**
 * A byte transport over a WebSocket, with each binary frame one chunk of the
 * protocol's byte stream. The transport is handed over at once and the
 * connection opens behind it: the first thing sent waits for it, and a
 * connection that fails to open fails what waits. So whoever lets go of the
 * transport, while it is still connecting or long after, drops the connection
 * that moment, and nothing is left to wait on a host that never answers. What
 * an error says of the URL stops before its query, which may carry a ticket.
 */
function socketTransport(url: string): ByteTransportFactory {
  const where = url.split("?", 1)[0] ?? url;
  return (handlers): ByteTransport => {
    const socket = new WebSocket(url, { maxPayload: DEFAULT_MAX_FRAME_LENGTH + 4 });
    let open = false;
    let dropped = false;
    const drop = (): void => {
      dropped = true;
      socket.terminate();
    };
    const failure = (): Error => new Error(`WebSocket error (${where})`);
    // What is sent waits for the connection to open, and fails if it never does.
    const opened = new Promise<void>((resolve, reject) => {
      socket.once("open", () => {
        open = true;
        resolve();
      });
      socket.once("error", () => reject(failure()));
      socket.once("close", () => reject(new Error(`WebSocket closed before it opened (${where})`)));
    });
    // Nothing may be waiting on it when it fails.
    opened.catch(() => undefined);

    socket.on("message", (data, isBinary) => {
      if (dropped) return;
      if (!isBinary || !Buffer.isBuffer(data)) {
        handlers.onError(new Error(`WebSocket sent a text frame, but the protocol is binary (${where})`));
        drop();
        return;
      }
      handlers.onData(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    });
    socket.on("error", () => {
      if (!dropped) handlers.onError(failure());
    });
    socket.on("close", () => {
      if (dropped) return;
      if (open) handlers.onClose();
      else handlers.onError(new Error(`WebSocket closed before it opened (${where})`));
    });

    return {
      async send(chunk) {
        await opened;
        await new Promise<void>((resolve, reject) => {
          // It says null, not nothing, when the chunk was written.
          socket.send(chunk, (error) => (error ? reject(error) : resolve()));
        });
      },
      close: drop,
    };
  };
}
