import type { TestContext } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { type GatewayOptions, type RunningGateway, startGateway } from "../index.ts";

/**
 * A gateway in this process, with a data directory of its own unless the test
 * gives one. It uses the test's runtime directory, so the test has to have one,
 * and the caller closes it.
 */
export function startGatewayInProcess(t: TestContext, options: Partial<GatewayOptions> = {}): Promise<RunningGateway> {
  return startGateway({ ...options, dataDir: options.dataDir ?? tempDir(t, "gateway-data") });
}
