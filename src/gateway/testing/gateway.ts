import type { TestContext } from "node:test";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { type GatewayOptions, type RunningGateway, startGateway } from "../index.ts";

/**
 * A gateway in this process, with a data directory of its own unless the test
 * gives one. It uses the test's runtime directory, so the test has to have one.
 * It is closed when the test ends, also when the test failed first, since a
 * gateway left listening keeps the whole test run from ending. A test may close
 * it sooner.
 */
export async function startGatewayInProcess(t: TestContext, options: Partial<GatewayOptions> = {}): Promise<RunningGateway> {
  const gateway = await startGateway({ ...options, dataDir: options.dataDir ?? tempDir(t, "gateway-data") });
  stopAfter(t, () => gateway.close());
  return gateway;
}
