/**
 * A whole gateway in its own process, for tests that kill it:
 *
 *   node gateway-child.ts <dataDir>
 *
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startGateway } from "../index.ts";

const [dataDir] = process.argv.slice(2);
if (dataDir === undefined) throw new Error("usage: gateway-child.ts <dataDir>");

await runUntilStopped(
  () => startGateway({ dataDir }),
  (gateway) => ({ event: "listening", socket: gateway.socket }),
);
