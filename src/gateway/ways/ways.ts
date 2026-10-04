import { chmodSync, mkdirSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import type { ProgramName } from "../../contracts/gateway/index.ts";
import { waysDirectory, wayInSocket } from "../../contracts/gateway/node.ts";
import { bridge, connectUpstream } from "../pipe/index.ts";

export interface WaysOptions {
  /** The programs that are registered now, each once. */
  names(): ProgramName[];
  /** The socket of the newest program registered under `target`, or undefined when there is none. */
  resolve(target: ProgramName): string | undefined;
  /** Told of a failure that belongs to no call, such as a way in that could not be taken away. */
  onError(error: Error): void;
}

/** A way in for each program that is registered. */
export interface Ways {
  /**
   * Make the ways in match the programs registered now: listen for a program
   * that has none, and stop for one that is gone. Resolves once every one is
   * listening. A pipe that was open stays open, so a program that registers
   * again after a restart never meets one that points at the old process.
   */
  sync(): Promise<void>;
  /** Stop listening, cut every open pipe and remove the sockets. */
  close(): Promise<void>;
}

interface Way {
  readonly server: Server;
  readonly path: string;
}

/**
 * The gateway's way in for each registered program: a Unix socket in the
 * runtime directory, named for the program, that pipes every connection to the
 * program's own socket and does nothing else. Nothing is read from the bytes,
 * so what a client says first is the program's own protocol, and a client
 * needs to be told no path, because the name works it out
 * (`wayInSocket`). The caller holds the gateway's lock, so every socket
 * already in the directory is left by a gateway that is gone, and is removed.
 * Nothing else in the directory is touched.
 */
export function createWays(options: WaysOptions): Ways {
  const directory = waysDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const file of readdirSync(directory)) {
    if (file.endsWith(".sock")) rmSync(join(directory, file), { force: true });
  }

  const listening = new Map<string, Way>();
  const pipes = new Set<Duplex>();
  // One change at a time: two of them listening or closing the same path would meet.
  let queue: Promise<void> = Promise.resolve();
  let closed = false;

  const track = (stream: Duplex): void => {
    pipes.add(stream);
    stream.once("close", () => pipes.delete(stream));
  };

  function accept(client: Socket, target: ProgramName): void {
    // A client can reset the connection at any point before the pipe takes it.
    client.on("error", () => undefined);
    track(client);
    const path = options.resolve(target);
    if (path === undefined) {
      client.destroy();
      return;
    }
    connectUpstream(path).then(
      (upstream) => {
        track(upstream);
        bridge(client, upstream);
      },
      () => client.destroy(),
    );
  }

  async function open(path: string, target: ProgramName): Promise<Way> {
    rmSync(path, { force: true });
    const server = createServer((client) => accept(client, target));
    server.on("error", (error) => options.onError(error));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => {
        server.off("error", reject);
        resolve();
      });
    });
    chmodSync(path, 0o600);
    return { server, path };
  }

  function stop({ server, path }: Way): void {
    // Stops listening now. Connections that are open end when their ends do.
    server.close();
    rmSync(path, { force: true });
  }

  async function reconcile(): Promise<void> {
    if (closed) return;
    const wanted = new Map(options.names().map((target) => [wayInSocket(target), target]));
    for (const [path, way] of listening) {
      if (wanted.has(path)) continue;
      listening.delete(path);
      stop(way);
    }
    for (const [path, target] of wanted) {
      if (listening.has(path)) continue;
      listening.set(path, await open(path, target));
    }
  }

  return {
    sync() {
      const done = queue.then(reconcile);
      queue = done.catch(() => undefined);
      return done;
    },
    async close() {
      closed = true;
      await queue;
      for (const pipe of pipes) pipe.destroy();
      for (const way of listening.values()) stop(way);
      listening.clear();
      try {
        rmdirSync(directory);
      } catch {
        // Something else is in it, so it stays.
      }
    },
  };
}
