import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { formatAddress } from "../../../lib/link/index.ts";
import type { DialPlace } from "../../../lib/link/node.ts";
import { type Child, type ChildOutput, startChild, stopAfter, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import type { Address } from "../index.ts";
import { type Client, connectClient, gatewaySocket } from "../node.ts";

/** The command that runs Shrimpy, which is how a person starts a program. */
export const SHRIMPY_ENTRY = fileURLToPath(new URL("../../../cli/main.ts", import.meta.url));

export interface TestGatewayOptions {
  /** Addresses for it to open the network entry on, for agents apart from it. A port of 0 picks one. */
  listen?: Address[];
  /** Where it keeps its roster: a directory of its own unless the test gives one. */
  dataDir?: string;
}

/** The line the gateway prints when it begins listening. */
export interface GatewayListening {
  event: string;
  dataDir: string;
  socket: string;
  /** The addresses its network entry listens on, each with the port it got. None unless it was told some or kept some. */
  listen: Address[];
  /** The file it read its addresses from when it was told none, or null. */
  listenKept: string | null;
  /** The fingerprint of its key, which it keeps when it starts again, as an invitation's link carries it. */
  fingerprint: string;
  pid: number;
}

export interface TestGateway {
  /** Where it keeps its roster. */
  readonly dataDir: string;
  /** What it printed when it last began listening. */
  readonly listening: GatewayListening;
  /** What the process it last ran as has printed, and how it ended once it has. */
  output(): ChildOutput;
  /** Link a client over its socket, as you, or as the holder of `token`. Closed when the test ends. */
  connect(token?: string): Promise<Client>;
  /** Ask it to stop, as SIGTERM does unless another signal is given, and wait until it has ended. */
  stop(signal?: NodeJS.Signals): Promise<ChildOutput>;
  /** Kill the process, like a gateway that went away. What it knew stays in its data. */
  outage(): Promise<void>;
  /** Start it again on the same data, like a gateway that came back: where it listened, unless `listen` says where now. */
  recover(listen?: Address[]): Promise<void>;
  /**
   * Stop the process without ending it, like a gateway that went dead: it still
   * takes connections and answers none of them, and the connections it holds
   * stay open. Killing it, as `outage` and the test's end do, works all the same.
   */
  freeze(): void;
  /** Let a gateway that was frozen run again. */
  thaw(): void;
}

/** A client linked to the gateway at `place`, as you with no token or as the holder of `token`, closed when the test ends. */
export async function connectTestClient(t: TestContext, place: DialPlace, token: string | null = null): Promise<Client> {
  const client = await connectClient({ place, token });
  stopAfter(t, () => client.close());
  return client;
}

const started = new WeakMap<TestContext, Promise<TestGateway>>();

/**
 * The real gateway, started through the command in a process of its own with a
 * Shrimpy folder of its own, listening in the test's runtime directory. Asking
 * again in the same test gives the same gateway, so every helper can ask for
 * the one it needs, and it is the first ask that says where it listens and
 * keeps its data. It is killed when the test ends if it is still running.
 */
export function startTestGateway(t: TestContext, options: TestGatewayOptions = {}): Promise<TestGateway> {
  const existing = started.get(t);
  if (existing !== undefined) return existing;
  const made = start(t, options);
  started.set(t, made);
  return made;
}

async function start(t: TestContext, options: TestGatewayOptions): Promise<TestGateway> {
  useRuntimeDir(t);
  const dataDir = options.dataDir ?? tempDir(t, "gateway-data");
  // A Shrimpy folder of its own, so that settings in a real one, such as a name, never reach the test.
  const folder = join(tempDir(t, "gateway-folder"), "shrimpy");
  let last: Child<GatewayListening>;
  let running: Child<GatewayListening> | undefined;
  /** Start it, told where to listen; told nowhere, it listens where it did. */
  const launch = async (listen: Address[]): Promise<void> => {
    last = await startChild<GatewayListening>(t, {
      file: SHRIMPY_ENTRY,
      args: ["gateway", "serve", "--data", dataDir, ...listen.flatMap((address) => ["--listen", formatAddress(address)])],
      env: { SHRIMPY_DIR: folder },
    });
    running = last;
  };
  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<ChildOutput> => {
    const stopping = running;
    running = undefined;
    return stopping === undefined ? last.output() : stopping.kill(signal);
  };
  await launch(options.listen ?? []);
  return {
    dataDir,
    get listening() {
      return last.line;
    },
    output: () => last.output(),
    connect: (token) => connectTestClient(t, { path: gatewaySocket() }, token ?? null),
    stop,
    async outage() {
      await stop("SIGKILL");
    },
    async recover(listen = []) {
      if (running !== undefined) throw new Error("The gateway is running.");
      await launch(listen);
    },
    freeze() {
      if (running !== undefined) process.kill(running.pid, "SIGSTOP");
    },
    thaw() {
      if (running !== undefined) process.kill(running.pid, "SIGCONT");
    },
  };
}
