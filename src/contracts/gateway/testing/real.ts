import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type Child, startChild, stopAfter, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import { type GatewayConnection } from "../index.ts";
import { connectLocalGateway } from "../node.ts";

/** The command that runs Shrimpy, which is how a person starts the gateway. */
const shrimpy = fileURLToPath(new URL("../../../cli/main.ts", import.meta.url));

export interface TestGateway {
  /** Where it keeps its roster. */
  readonly dataDir: string;
  /** Connect over its socket, as the person who runs it until the connection signs in. Closed when the test ends. */
  connect(): Promise<GatewayConnection>;
  /** Kill the process, like a gateway that went away. What it knew stays in its data. */
  outage(): Promise<void>;
  /** Start it again on the same data, like a gateway that came back. */
  recover(): Promise<void>;
}

const started = new WeakMap<TestContext, Promise<TestGateway>>();

/**
 * The real gateway, started through the command in a process of its own with a
 * data directory of its own, listening in the test's runtime directory. Asking
 * again in the same test gives the same gateway, so every helper can ask for
 * the one it needs. It is killed when the test ends if it is still running.
 */
export function startTestGateway(t: TestContext): Promise<TestGateway> {
  const existing = started.get(t);
  if (existing !== undefined) return existing;
  const made = start(t);
  started.set(t, made);
  return made;
}

async function start(t: TestContext): Promise<TestGateway> {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "gateway-data");
  let running: Child<unknown> | undefined;
  const launch = async (): Promise<void> => {
    running = await startChild(t, { file: shrimpy, args: ["gateway", "serve", "--data", dataDir] });
  };
  await launch();
  return {
    dataDir,
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
      await launch();
    },
  };
}
