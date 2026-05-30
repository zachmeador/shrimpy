import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const POLL_INTERVAL_MS = 100;
const DEFAULT_TERMINATE_TIMEOUT_MS = 5_000;

export function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err instanceof Error && "code" in err && err.code === "EPERM";
  }
}

export function isGatewayProcess(pid: number): boolean {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8");
    return cmdline.includes("gateway.js");
  } catch {
    return false;
  }
}

export function readPidFile(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function writePidFile(path: string, pid: number): void {
  writeFileSync(path, `${pid}\n`, "utf-8");
}

export function removePidFile(path: string): void {
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
  } catch {}
}

/**
 * Returns the PID of an alive gateway process tracked by this file, or null.
 * Cleans up stale files (PID dead or PID alive but not a gateway process).
 */
export function findRunningGatewayPid(path: string): number | null {
  const pid = readPidFile(path);
  if (pid === null) return null;
  if (!isAlive(pid) || !isGatewayProcess(pid)) {
    removePidFile(path);
    return null;
  }
  return pid;
}

/**
 * SIGTERM the process, poll until it exits or the timeout elapses, then
 * escalate to SIGKILL. Returns once the process is no longer alive (or the
 * SIGKILL has been sent).
 */
export async function terminateGateway(
  pid: number,
  opts?: { timeoutMs?: number },
): Promise<void> {
  if (!isAlive(pid)) return;

  try {
    process.kill(pid, "SIGTERM");
  } catch {}

  const deadline = Date.now() + (opts?.timeoutMs ?? DEFAULT_TERMINATE_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}
