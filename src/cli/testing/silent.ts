import { createServer, type Socket } from "node:net";
import type { TestContext } from "node:test";
import { namedSocketPath } from "../../lib/runtime/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";

export interface SilentServer {
  /** How many connections it has taken and still holds open. */
  connections(): number;
}

/**
 * A server on the socket called `name` in the test's runtime directory that
 * takes every connection and never says a word: a program that accepted the
 * connection and then stopped answering. A test waits on `connections` to know
 * that something has reached it. It lets go of them when the test ends.
 */
export async function startSilentServer(t: TestContext, name: string): Promise<SilentServer> {
  const held = new Set<Socket>();
  const server = createServer((socket) => {
    held.add(socket);
    socket.on("close", () => held.delete(socket));
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(namedSocketPath(name), resolve);
  });
  stopAfter(t, async () => {
    for (const socket of held) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { connections: () => held.size };
}
