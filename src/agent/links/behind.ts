import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { compareShrimpy, linksWith, type Versions } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/**
 * What an agent does when its gateway turns it away: when the gateway runs a
 * newer release that this code can't link with, after a release that changed
 * the Pi packages or the major, nothing can reach the agent to ask it to
 * update, so it runs `shrimpy update` with the gateway's version itself. That
 * installs the version and restarts the service, this agent with it. From a
 * checkout `shrimpy update` refuses, and says how to update instead. It is
 * tried once for each version the gateway runs, and never for a version past
 * the gateway's. `shrimpy` is the program and arguments that run this
 * Shrimpy, and `tell` hears what came of it, a line at a time.
 */
export function followGateway(shrimpy: readonly string[], tell: (line: string) => void): (gateway: Versions) => void {
  const tried = new Set<string>();
  return (gateway) => {
    const version = gateway.shrimpy;
    if (linksWith(gateway) || (compareShrimpy(version, SHRIMPY_VERSION) ?? 0) <= 0 || tried.has(version)) return;
    tried.add(version);
    const shown = `shrimpy update ${oneLine(version)}`;
    tell(`The gateway runs Shrimpy ${oneLine(version)}, which this agent's ${SHRIMPY_VERSION} can't link with, so it runs ${shown}.`);
    const [program, ...args] = shrimpy;
    if (program === undefined) return;
    const child = spawn(program, [...args, "update", version], { stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on("line", (line) => tell(`${shown}: ${line}`));
    child.once("error", (error) => tell(`Could not run ${shown}: ${error.message}`));
    child.once("close", (code, signal) => {
      if (code === 0) return;
      tell(`${shown} failed (${signal === null ? `exit code ${String(code)}` : `signal ${signal}`}). This agent tries again once the gateway runs another version, or when it starts again.`);
    });
  };
}
