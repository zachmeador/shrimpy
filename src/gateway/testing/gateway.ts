import type { TestContext } from "node:test";
import { connectGateway, type GatewayClient, type GatewayPlace } from "../../contracts/gateway/node.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type GatewayOptions, type RunningGateway, startGateway } from "../index.ts";

export type TestGatewayOptions = Partial<GatewayOptions>;

export interface TestGateway extends RunningGateway {
  /** Where it keeps its roster, for a gateway started again on the same data. */
  readonly dataDir: string;
}

/**
 * The gateway in this process, in the test's own runtime directory, with a
 * data directory of its own unless it is given one, closed when the test ends.
 */
export async function startTestGateway(t: TestContext, options: TestGatewayOptions = {}): Promise<TestGateway> {
  useRuntimeDir(t);
  const dataDir = options.dataDir ?? tempDir(t, "gateway-data");
  const gateway = await startGateway({ ...options, dataDir });
  stopAfter(t, () => gateway.close());
  return { ...gateway, dataDir };
}

/** A client linked to the gateway at `place`, as you with no token, closed when the test ends. */
export async function connectTestClient(t: TestContext, place: GatewayPlace, token: string | null = null): Promise<GatewayClient> {
  const client = await connectGateway({ place, token });
  stopAfter(t, () => client.close());
  return client;
}
