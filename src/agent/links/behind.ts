import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { compareShrimpy } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/**
 * Follow the gateway to each newer release, since the gateway's machine updates
 * first: when the gateway's welcome or refusal says it runs a newer version than
 * this agent, the agent runs `shrimpy update` with that version, which installs
 * it and restarts the service, this agent with it. It is tried once for each
 * version, and not for a build between releases, such as `2.1.0-dev` from a
 * checkout, which no release has. From a checkout `shrimpy update` refuses, and
 * says how to update instead. `shrimpy` is the program and arguments that run
 * this Shrimpy, and `tell` hears what came of it, a line at a time.
 */
export function followGateway(shrimpy: readonly string[], tell: (line: string) => void): (version: string) => void {
  const tried = new Set<string>();
  return (version) => {
    if ((compareShrimpy(version, SHRIMPY_VERSION) ?? 0) <= 0 || version.endsWith("-dev") || tried.has(version)) return;
    tried.add(version);
    const shown = `shrimpy update ${oneLine(version)}`;
    tell(`The gateway runs Shrimpy ${oneLine(version)}, newer than this agent's ${SHRIMPY_VERSION}, so it runs ${shown}.`);
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
