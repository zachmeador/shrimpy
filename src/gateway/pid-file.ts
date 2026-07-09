import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

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

export interface GatewayProcessLookup {
  command?: (pid: number) => string | null;
  isAlive?: (pid: number) => boolean;
}

/** Return the complete command for a PID on both Linux and macOS. */
export function gatewayProcessCommand(pid: number): string {
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`);
    return cmdline.toString("utf-8").replaceAll("\0", " ");
  } catch {
    // macOS has no /proc. `ps` is also useful on BSD-derived systems.
    try {
      return String(execFileSync("ps", ["-p", String(pid), "-o", "command="], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      })).trim();
    } catch {
      return "";
    }
  }
}

export function isExpectedGatewayProcess(
  pid: number,
  lookup: GatewayProcessLookup = {},
): boolean {
  const command = (lookup.command ?? gatewayProcessCommand)(pid);
  return command !== null && /(?:^|[\\/])gateway\.js(?:\s|$)/.test(command);
}

export function isGatewayProcess(pid: number, lookup?: GatewayProcessLookup): boolean {
  return isExpectedGatewayProcess(pid, lookup);
}

export class GatewayAlreadyRunningError extends Error {
  readonly pid: number;

  constructor(pid: number) {
    super(`another gateway is already running (PID ${pid})`);
    this.name = "GatewayAlreadyRunningError";
    this.pid = pid;
  }
}

export interface GatewayClaimOptions extends GatewayProcessLookup {
  pid?: number;
}

/** Atomically claim the PID path, reclaiming only a confirmed stale owner. */
export function claimGatewayPid(path: string, opts: GatewayClaimOptions = {}): number {
  const pid = opts.pid ?? process.pid;
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lockFd: number | undefined;
  try {
    try {
      lockFd = openSync(lockPath, "wx");
      writeFileSync(lockFd, `${process.pid}\n`, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        const lockPid = readPidFile(lockPath);
        if (lockPid !== null && !isAlive(lockPid)) {
          try { unlinkSync(lockPath); } catch {}
          lockFd = openSync(lockPath, "wx");
          writeFileSync(lockFd, `${process.pid}\n`, "utf-8");
        } else {
          throw new Error("gateway ownership claim is already in progress");
        }
      }
      else throw err;
    }

    const existing = readPidFile(path);
    if (existing !== null) {
      const alive = (opts.isAlive ?? isAlive)(existing);
      const gateway = alive && isExpectedGatewayProcess(existing, opts);
      if (alive && gateway) throw new GatewayAlreadyRunningError(existing);
      removePidFile(path);
    }
    const fd = openSync(path, "wx");
    try {
      writeFileSync(fd, `${pid}\n`, "utf-8");
    } finally {
      closeSync(fd);
    }
    return pid;
  } finally {
    if (lockFd !== undefined) closeSync(lockFd);
    try { unlinkSync(lockPath); } catch {}
  }
}

/** Remove a claim only when it still belongs to the supplied process. */
export function releaseGatewayPid(path: string, pid: number): boolean {
  if (readPidFile(path) !== pid) return false;
  try {
    unlinkSync(path);
    return true;
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
export function findRunningGatewayPid(
  path: string,
  lookup: GatewayProcessLookup = {},
): number | null {
  const pid = readPidFile(path);
  if (pid === null) return null;
  if (!(lookup.isAlive ?? isAlive)(pid) || !isExpectedGatewayProcess(pid, lookup)) {
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
