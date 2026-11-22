import { join } from "node:path";
import type { TestContext } from "node:test";
import { pagePortOfItsOwn } from "../../contracts/gateway/testing/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type GatewayOptions, type RunningGateway, startGateway } from "../index.ts";

export type GatewayInProcessOptions = Partial<GatewayOptions>;

export interface GatewayInProcess extends RunningGateway {
  /** Where it keeps its roster, for a gateway started again on the same data. */
  readonly dataDir: string;
}

/**
 * The gateway in this process, in the test's own runtime directory, with a
 * data directory of its own unless it is given one, closed when the test ends.
 * Given the page and no settings, its page door has a port of its own. Every
 * option a gateway takes can be given, which the gateway's own tests need and
 * the command that starts it does not offer. Tests of what links to the
 * gateway start the real one, as a process of its own, with the contract's test
 * support.
 */
export async function startGatewayInProcess(t: TestContext, options: GatewayInProcessOptions = {}): Promise<GatewayInProcess> {
  useRuntimeDir(t);
  const dataDir = options.dataDir ?? tempDir(t, "gateway-data");
  let { settings } = options;
  if (settings === undefined && options.page !== undefined) {
    settings = join(tempDir(t, "settings"), "settings.json");
    pagePortOfItsOwn(settings);
  }
  const gateway = await startGateway({ ...options, dataDir, ...(settings === undefined ? {} : { settings }) });
  stopAfter(t, () => gateway.close());
  return { ...gateway, dataDir };
}
