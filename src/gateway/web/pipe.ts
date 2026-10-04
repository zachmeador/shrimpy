import { createConnection, type Socket } from "node:net";
import { pipeline } from "node:stream";
import { createWebSocketStream, type WebSocket } from "ws";

/** Connect to a program's Unix socket. Rejects when nothing is listening there. */
export function connectUpstream(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      // A failure from here on ends the socket, and the bridge sees it close.
      socket.on("error", () => undefined);
      resolve(socket);
    });
  });
}

/**
 * Join a WebSocket and a program's socket into one byte stream. Each side
 * waits for the other to take what it sends, so a slow reader slows the
 * writer instead of filling the gateway's memory. When either side closes,
 * what it already sent is delivered and then the other side is closed; when
 * either side fails, both are dropped at once.
 */
export function bridge(ws: WebSocket, upstream: Socket): void {
  const stream = createWebSocketStream(ws);
  pipeline(stream, upstream, stream, () => {
    stream.destroy();
    upstream.destroy();
  });
}
