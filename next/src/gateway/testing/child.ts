import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

/**
 * Start one of the fixtures in this directory as its own process, and wait for
 * the line it prints when it is ready. The process inherits the environment,
 * including SHRIMPY_RUNTIME_DIR.
 */
export async function startChild(
  fixture: "gateway-child.ts" | "registrant-child.ts",
  args: string[] = [],
): Promise<ChildProcess> {
  const script = fileURLToPath(new URL(`./${fixture}`, import.meta.url));
  const child = spawn(process.execPath, [script, ...args], { stdio: ["ignore", "pipe", "inherit"] });
  const failed = new Promise<never>((_, reject) => {
    child.once("exit", (code, signal) => {
      reject(new Error(`${fixture} exited (${String(code ?? signal)}) before it was ready`));
    });
  });
  // Once the child is ready this rejection arrives with its exit and is no one's business.
  failed.catch(() => undefined);
  await Promise.race([once(child.stdout, "data"), failed]);
  return child;
}

/** Stop a child with `signal` and wait until it has exited. */
export async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  await once(child, "exit");
}
