import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerListener } from "@earendil-works/pi-server";
import { type RawData, WebSocketServer } from "ws";

// pi-server does not export its connection types from the package root, but they are reachable through ServerListener.
type Accept = Parameters<ServerListener["start"]>[0];
type Connection = Parameters<Accept>[0];

export interface WsListener extends ServerListener {
	/** The bound port; valid after start(). */
	readonly port: number;
}

const bytes = (data: RawData): Uint8Array => {
	const buffer = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data;
	return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * The WebSocket bridge: every binary frame is one chunk of pi-protocol's framed CBOR byte stream, in order.
 * The same http server also serves the page, so the browser needs one origin and no CORS.
 */
export function createWsListener(options: {
	host: string;
	port: number;
	/** Plain HTTP for the page and its config. */
	http(request: IncomingMessage, response: ServerResponse): void;
	onError?: (error: Error) => void;
}): WsListener {
	const http = createServer(options.http);
	const sockets = new WebSocketServer({ server: http, path: "/ws" });
	return {
		get port() {
			return (http.address() as AddressInfo).port;
		},
		async start(accept) {
			sockets.on("connection", (socket) => {
				let closed = false;
				const connection: Connection = {
					get closed() {
						return closed;
					},
					send: (chunk) => new Promise<void>((resolve, reject) => socket.send(chunk, (error) => (error ? reject(error) : resolve()))),
					close: (finalChunk) => {
						if (finalChunk) socket.send(finalChunk, () => socket.close());
						else socket.close();
					},
				};
				const handler = accept(connection);
				socket.on("message", (data) => handler.onData(bytes(data)));
				socket.on("error", (error) => handler.onError(error));
				socket.on("close", () => {
					closed = true;
					handler.onClose();
				});
			});
			await new Promise<void>((resolve, reject) => {
				http.once("error", reject);
				http.listen(options.port, options.host, resolve);
			});
		},
		async close() {
			for (const socket of sockets.clients) socket.terminate();
			await new Promise<void>((resolve) => sockets.close(() => resolve()));
			await new Promise<void>((resolve) => http.close(() => resolve()));
		},
	};
}
