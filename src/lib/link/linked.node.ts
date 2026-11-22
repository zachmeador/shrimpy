import { type Link, webSocketLink } from "@earendil-works/chord";
import type { WebSocket } from "ws";
import type { Linked } from "./linked.ts";

/** The most one WebSocket frame may carry. Chord bounds each part of a message well below it. */
export const MAX_FRAME = 64 * 1024 * 1024;

/**
 * `socket` as a Chord link. Made in the same turn as the answer, so no frame
 * after it is missed. When Chord closes the link, as its heartbeat does with a
 * silent one, the socket is dropped at once rather than closed politely, since
 * a peer that went silent never answers a goodbye.
 */
export function linkOver(socket: WebSocket): Linked {
  const closed = new Promise<void>((resolve) => {
    if (socket.readyState === socket.CLOSED) resolve();
    else socket.once("close", () => resolve());
  });
  const chords = webSocketLink(socket);
  const link: Link = {
    send: (message) => chords.send(message),
    onMessage: (listener) => chords.onMessage(listener),
    onClose: (listener) => chords.onClose(listener),
    close() {
      chords.close();
      socket.terminate();
    },
  };
  return { link, closed, drop: () => socket.terminate() };
}

/** The text of a frame `ws` handed over. */
export function textOf(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}
