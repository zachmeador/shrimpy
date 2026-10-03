import { connect, createServer, type Socket } from "node:net";
import { namedSocketPath } from "../../lib/runtime/index.ts";

export interface BytesTarget {
  readonly socket: string;
  /** Every connection it has accepted, oldest first. */
  readonly connections: Socket[];
  /** How many of them are still open. */
  open(): number;
  /** Everything the connections have sent it. */
  received(): Buffer;
  close(): Promise<void>;
}

/**
 * A plain Unix socket server in the runtime directory, to see exactly which
 * bytes a pipe passes and when it closes.
 */
export async function startBytesTarget(name: string): Promise<BytesTarget> {
  const socket = namedSocketPath(name);
  const connections: Socket[] = [];
  const chunks: Buffer[] = [];
  let open = 0;
  const server = createServer((connection) => {
    connections.push(connection);
    open += 1;
    connection.on("data", (chunk: Buffer) => chunks.push(chunk));
    connection.on("error", () => undefined);
    connection.once("close", () => {
      open -= 1;
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  return {
    socket,
    connections,
    open: () => open,
    received: () => Buffer.concat(chunks),
    async close() {
      for (const connection of connections) connection.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Whether a TCP connection to `host` and `port` is accepted. */
export function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect({ host, port });
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", () => resolve(false));
  });
}
