/**
 * A program that joins the roster as an agent, registers with the gateway and
 * holds the connection open, for tests that kill it:
 *
 *   node registrant-child.ts <name>
 *
 * Prints one JSON line when it is registered, then runs until SIGTERM.
 */
import { randomUUID } from "node:crypto";
import { connectLocalGateway } from "../../contracts/gateway/node.ts";
import { runUntilStopped } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

const [name] = process.argv.slice(2);
if (name === undefined) throw new Error("usage: registrant-child.ts <name>");

await runUntilStopped(
  async () => {
    const gateway = await connectLocalGateway();
    await gateway.join(name);
    await gateway.register({
      kind: "agent",
      serverId: randomUUID(),
      socket: `/tmp/${name}.sock`,
      pid: process.pid,
      version: SHRIMPY_VERSION,
    });
    return gateway;
  },
  () => ({ event: "registered", pid: process.pid }),
);
