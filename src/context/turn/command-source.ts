import { exec } from "node:child_process";
import { promisify } from "node:util";
import { shrimpyRuntimeChildEnv } from "../../app/environment.js";
import type { AppRuntime } from "../../app/runtime.js";
import { isRecord } from "../../util/record.js";
import type { ResolvedContextCommandSource } from "../source.js";
import { clipContextWithMarker } from "./render.js";
import type { TurnContextItem } from "./types.js";

const execAsync = promisify(exec);

interface ContextSourceCommandRunContext {
  runtime: AppRuntime;
  agentId: string;
  channel?: string;
  sessionType: string;
}

interface ContextSourceCommandRunResult {
  raw: string;
  items: TurnContextItem[];
  error?: string;
}

export async function runContextSourceCommand(
  command: ResolvedContextCommandSource,
  ctx: ContextSourceCommandRunContext,
): Promise<ContextSourceCommandRunResult> {
  try {
    const { stdout } = await execAsync(command.command, {
      cwd: ctx.runtime.paths.workspace,
      timeout: command.timeoutMs,
      env: {
        ...shrimpyRuntimeChildEnv(ctx.runtime.paths.workspace),
        SHRIMPY_CONTEXT_AGENT: ctx.agentId,
        SHRIMPY_CONTEXT_CHANNEL: ctx.channel ?? "",
        SHRIMPY_CONTEXT_SESSION_TYPE: ctx.sessionType,
      },
      maxBuffer: Math.max(command.maxChars * 4, 4096),
    });
    const raw = clipContextWithMarker(stdout.trim(), command.maxChars);
    return {
      raw,
      items: parseCommandOutput(command.id, raw),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      raw: "",
      items: [{
        id: `command:${command.id}:error`,
        summary: `${command.id}: context command failed (${error})`,
        inspect: command.command,
      }],
      error,
    };
  }
}

function parseCommandOutput(commandId: string, output: string): TurnContextItem[] {
  if (!output) return [];
  const parsed = parseJsonOutput(output);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item, index) => parseCommandItem(commandId, item, index));
  }
  if (isRecord(parsed) && Array.isArray(parsed.items)) {
    return parsed.items.flatMap((item, index) => parseCommandItem(commandId, item, index));
  }
  if (isRecord(parsed)) {
    return parseCommandItem(commandId, parsed, 0);
  }
  return output.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `command:${commandId}:${index}`,
      summary: `${commandId}: ${line}`,
    }));
}

function parseJsonOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

function parseCommandItem(
  commandId: string,
  item: unknown,
  index: number,
): TurnContextItem[] {
  if (typeof item === "string") {
    return [{ id: `command:${commandId}:${index}`, summary: `${commandId}: ${item}` }];
  }
  if (!isRecord(item)) return [];
  const summary = typeof item.summary === "string"
    ? item.summary
    : typeof item.text === "string"
      ? item.text
      : undefined;
  if (!summary) return [];
  return [{
    id: typeof item.id === "string" ? item.id : `command:${commandId}:${index}`,
    summary,
    inspect: typeof item.inspect === "string" ? item.inspect : undefined,
  }];
}
