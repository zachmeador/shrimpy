import type { ByteTransportFactory } from "@earendil-works/pi-client";

/**
 * A byte transport over the platform's WebSocket, which browsers and Node both
 * have. Each binary frame is one chunk of the protocol's byte stream. What an
 * error says of the URL stops before its query, which may carry a ticket.
 * This is the transport for a page in a browser. A program reaches the
 * gateway's network entry with `entryTransports`, which can drop a connection
 * at once.
 */
export function webSocketTransport(url: string): ByteTransportFactory {
  const where = url.split("?", 1)[0] ?? url;
  return (handlers) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      let open = false;
      socket.onopen = () => {
        open = true;
        resolve({
          send(chunk) {
            if (socket.readyState !== WebSocket.OPEN) {
              return Promise.reject(new Error(`WebSocket is not open (${where})`));
            }
            socket.send(chunk);
            return Promise.resolve();
          },
          close: () => socket.close(),
        });
      };
      socket.onmessage = (event) => {
        const data: unknown = event.data;
        if (data instanceof ArrayBuffer) {
          handlers.onData(new Uint8Array(data));
          return;
        }
        handlers.onError(new Error(`WebSocket sent a text frame, but the protocol is binary (${where})`));
        socket.close();
      };
      // Before the socket opens, the failure belongs to the caller; afterwards, to the handlers.
      socket.onerror = () => {
        const error = new Error(`WebSocket error (${where})`);
        if (open) handlers.onError(error);
        else reject(error);
      };
      socket.onclose = () => {
        if (open) handlers.onClose();
        else reject(new Error(`WebSocket closed before it opened (${where})`));
      };
    });
}
