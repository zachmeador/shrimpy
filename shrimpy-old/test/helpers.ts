import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureWorkspaceInitialized } from "../dist/setup/init.js";

export interface CapturedLogs<T> {
  result: T;
  lines: string[];
  errors: string[];
}

export async function captureLogs<T>(
  fn: () => T | Promise<T>,
): Promise<CapturedLogs<Awaited<T>>> {
  const originalLog = console.log;
  const originalError = console.error;
  const lines: string[] = [];
  const errors: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

export function makeTempWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempWorkspace(path: string | undefined): void {
  if (!path) return;
  rmSync(path, { recursive: true, force: true });
}

export function setupInit(workspace: string): void {
  ensureWorkspaceInitialized(workspace);
}
