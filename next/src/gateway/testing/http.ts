import { randomBytes } from "node:crypto";
import { type IncomingHttpHeaders, request } from "node:http";

/**
 * Ask for a WebSocket upgrade and report the status the server answered with:
 * 101 when it accepted, and the refusal's status otherwise. Headers given
 * here replace the defaults, which are those of a valid handshake. The
 * connection is closed straight away.
 */
export function handshakeStatus(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const handshake = request({
      host: "127.0.0.1",
      port,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        ...headers,
      },
    });
    handshake.once("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    handshake.once("response", (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    handshake.once("error", reject);
    handshake.end();
  });
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * Send a request with `path` exactly as written. Unlike `fetch`, nothing here
 * tidies `/../` away before the server sees it.
 */
export function rawRequest(port: number, path: string, method = "GET"): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: "127.0.0.1", port, path, method, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}
