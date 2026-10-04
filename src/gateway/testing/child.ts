import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type Child, startChild } from "../../lib/testing/index.ts";

const script = (name: string): string => fileURLToPath(new URL(`./${name}`, import.meta.url));

/**
 * A whole gateway in its own process, keeping its roster in `dataDir`. It puts
 * its sockets in the test's runtime directory, so the test has to have one. It
 * is killed when the test ends if it is still running.
 */
export function startGatewayChild(
  t: TestContext,
  dataDir: string,
): Promise<Child<{ event: string; socket: string }>> {
  return startChild(t, { file: script("gateway-child.ts"), args: [dataDir] });
}

/** A program that registers with the gateway as an agent called `name`, and holds the connection open. */
export function startRegistrantChild(
  t: TestContext,
  name: string,
): Promise<Child<{ event: string; pid: number }>> {
  return startChild(t, { file: script("registrant-child.ts"), args: [name] });
}
