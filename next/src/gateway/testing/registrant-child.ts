/**
 * A program that registers with the gateway and holds the connection open,
 * for tests that kill it:
 *
 *   node registrant-child.ts <name>
 *
 * Prints one JSON line when it is registered, then runs until SIGTERM.
 */
import { randomUUID } from "node:crypto";
import { connectLocalGateway } from "../../contracts/gateway/node.ts";

const [name] = process.argv.slice(2);
if (name === undefined) throw new Error("usage: registrant-child.ts <name>");

const gateway = await connectLocalGateway();
await gateway.register({
  kind: "agent",
  name,
  serverId: randomUUID(),
  socket: `/tmp/${name}.sock`,
  pid: process.pid,
});
process.stdout.write(`${JSON.stringify({ event: "registered", pid: process.pid })}\n`);

await new Promise<void>((resolve) => {
  process.once("SIGTERM", resolve);
  process.once("SIGINT", resolve);
});
await gateway.close();
