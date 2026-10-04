import type { Registration } from "../../contracts/gateway/index.ts";
import { connectLocalGateway } from "../../contracts/gateway/node.ts";
import { eventually } from "../../lib/testing/index.ts";

/**
 * Wait until the gateway on this machine lists the program, and say what it
 * lists. A program prints that it is listening before it has registered, so a
 * test that needs the registration waits for it.
 */
export async function untilRegistered(kind: Registration["kind"], name: string): Promise<Registration> {
  const found = await eventually(
    async () => {
      const gateway = await connectLocalGateway();
      try {
        return (await gateway.list()).findLast((program) => program.kind === kind && program.name === name);
      } finally {
        await gateway.close();
      }
    },
    (registration) => registration !== undefined,
    { what: `the ${kind} ${name} to be registered`, timeoutMs: 30_000 },
  );
  if (found === undefined) throw new Error(`The ${kind} ${name} did not register`);
  return found;
}
