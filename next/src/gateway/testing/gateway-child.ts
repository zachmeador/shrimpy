/**
 * A whole gateway in its own process, for tests that kill it:
 *
 *   node gateway-child.ts
 *
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { startGateway } from "../index.ts";

const gateway = await startGateway();
process.stdout.write(`${JSON.stringify({ event: "listening", socket: gateway.socket })}\n`);

await new Promise<void>((resolve) => {
  process.once("SIGTERM", resolve);
  process.once("SIGINT", resolve);
});
await gateway.close();
