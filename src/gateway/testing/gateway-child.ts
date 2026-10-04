/**
 * A whole gateway in its own process, for tests that kill it:
 *
 *   node gateway-child.ts
 *
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startGateway } from "../index.ts";

await runUntilStopped(
  () => startGateway(),
  (gateway) => ({ event: "listening", socket: gateway.socket }),
);
