import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  WatchCommandAction,
  WatchEmitConfig,
} from "./schema.js";

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 1024 * 1024;
const PREVIEW_LIMIT = 800;

export interface CommandWatchResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
  outputHash: string;
}

export async function runCommandWatchAction(
  action: WatchCommandAction,
  env?: NodeJS.ProcessEnv,
): Promise<CommandWatchResult> {
  try {
    const result = await execAsync(action.command, {
      cwd: action.cwd,
      timeout: action.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(env ? { env } : {}),
      maxBuffer: MAX_BUFFER,
    });
    const stdout = String(result.stdout);
    const stderr = String(result.stderr);
    return {
      ok: true,
      command: action.command,
      stdout,
      stderr,
      outputHash: hashOutput(stdout, stderr),
    };
  } catch (err) {
    const candidate = err as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
      signal?: string;
    };
    const stdout = String(candidate.stdout ?? "");
    const stderr = String(candidate.stderr ?? "");
    const exitCode = typeof candidate.code === "number"
      ? candidate.code
      : undefined;
    const error = candidate.signal
      ? `${candidate.message} (${candidate.signal})`
      : candidate.message;
    return {
      ok: false,
      command: action.command,
      stdout,
      stderr,
      ...(exitCode !== undefined ? { exitCode } : {}),
      error,
      outputHash: hashOutput(stdout, stderr),
    };
  }
}

export function renderCommandEmitText(input: {
  emit?: WatchEmitConfig;
  watchId: string;
  runId: string;
  summary: string;
  result: CommandWatchResult;
}): string {
  const template = input.emit?.template;
  if (template) {
    return template
      .replaceAll("{{summary}}", input.summary)
      .replaceAll("{{stdout}}", clip(input.result.stdout))
      .replaceAll("{{stderr}}", clip(input.result.stderr))
      .replaceAll("{{exitCode}}", String(input.result.exitCode ?? 0))
      .replaceAll("{{watchId}}", input.watchId)
      .replaceAll("{{runId}}", input.runId);
  }

  if (input.result.ok) {
    const stdout = input.result.stdout.trim();
    return stdout.length > 0 ? stdout : input.summary;
  }

  const detail = input.result.stderr.trim() || (input.result.error ?? "command failed");
  return `${input.summary}: ${clip(detail)}`;
}

export function summarizeCommandResult(
  result: CommandWatchResult,
): string {
  if (!result.ok) {
    return `command failed${result.exitCode !== undefined ? ` with exit ${result.exitCode}` : ""}`;
  }
  if (result.stdout.trim().length > 0) {
    return `command produced ${result.stdout.trim().length} stdout character(s)`;
  }
  if (result.stderr.trim().length > 0) {
    return `command produced ${result.stderr.trim().length} stderr character(s)`;
  }
  return "command completed with no output";
}

export function clip(value: string, max = PREVIEW_LIMIT): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
}

function hashOutput(stdout: string, stderr: string): string {
  return createHash("sha256")
    .update(stdout)
    .update("\0")
    .update(stderr)
    .digest("hex");
}
