import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type Child, startChild, stopAfter, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import { type Address, formatAddress, type GatewayConnection } from "../index.ts";
import { connectLocalGateway } from "../node.ts";

/** The command that runs Shrimpy, which is how a person starts the gateway. */
const shrimpy = fileURLToPath(new URL("../../../cli/main.ts", import.meta.url));

export interface TestGatewayOptions {
  /** Addresses for it to open the network entry on, for agents apart from it. A port of 0 picks one. */
  listen?: Address[];
}

export interface TestGateway {
  /** Where it keeps its roster. */
  readonly dataDir: string;
  /**
   * The addresses its network entry listens on, each with the port it got.
   * None unless the test asked for some. It listens there again when it
   * recovers.
   */
  readonly listening: Address[];
  /** Connect over its socket, as the person who runs it until the connection signs in. Closed when the test ends. */
  connect(): Promise<GatewayConnection>;
  /** Kill the process, like a gateway that went away. What it knew stays in its data. */
  outage(): Promise<void>;
  /** Start it again on the same data, like a gateway that came back. */
  recover(): Promise<void>;
  /**
   * Stop the process without ending it, like a gateway that went dead: it still
   * takes connections and answers none of them, and the connections it holds
   * stay open. Killing it, as `outage` and the test's end do, works all the same.
   */
  freeze(): void;
  /** Let a gateway that was frozen run again. */
  thaw(): void;
}

const started = new WeakMap<TestContext, Promise<TestGateway>>();

/**
 * The real gateway, started through the command in a process of its own with a
 * data directory of its own, listening in the test's runtime directory. Asking
 * again in the same test gives the same gateway, so every helper can ask for
 * the one it needs, and it is the first ask that says where it listens. It is
 * killed when the test ends if it is still running.
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
  const dataDir = tempDir(t, "gateway-data");
  let running: Child<{ listen: Address[] }> | undefined;
  /** The first start is told where to listen, and a later one listens where it did. */
  const launch = async (listen: Address[]): Promise<void> => {
    running = await startChild(t, {
      file: shrimpy,
      args: ["gateway", "serve", "--data", dataDir, ...listen.flatMap((address) => ["--listen", formatAddress(address)])],
    });
  };
  await launch(options.listen ?? []);
  const listening = running?.line.listen ?? [];
  return {
    dataDir,
    listening,
    async connect() {
      const connection = await connectLocalGateway();
      stopAfter(t, () => connection.close());
      return connection;
    },
    async outage() {
      const stopped = running;
      running = undefined;
      await stopped?.kill("SIGKILL");
    },
    async recover() {
      if (running !== undefined) throw new Error("The gateway is running.");
      await launch([]);
    },
    freeze() {
      if (running !== undefined) process.kill(running.pid, "SIGSTOP");
    },
    thaw() {
      if (running !== undefined) process.kill(running.pid, "SIGCONT");
    },
  };
}
