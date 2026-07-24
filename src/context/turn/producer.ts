import { exec } from "node:child_process";
import { promisify } from "node:util";
import { shrimpyRuntimeChildEnv } from "../../app/environment.js";
import type { AppRuntime } from "../../app/runtime.js";
import { channelMatches } from "../../util/channel-pattern.js";
import { isRecord } from "../../util/record.js";
import { clipContextWithMarker } from "./render.js";
import type { TurnContextItem } from "./types.js";

const execAsync = promisify(exec);

export interface ContextTurnProducerWhenConfig {
  channels?: string[];
}

export interface ContextTurnProducerConfig {
  id: string;
  run: string;
  when?: ContextTurnProducerWhenConfig;
  timeoutMs?: number;
  cacheMs?: number;
  maxChars?: number;
}

export interface ResolvedContextTurnProducer {
  id: string;
  run: string;
  when: {
    channels?: string[];
  };
  timeoutMs: number;
  cacheMs: number;
  maxChars: number;
}

export const TURN_PRODUCER_DEFAULTS = {
  timeoutMs: 5000,
  cacheMs: 60_000,
  maxChars: 1200,
} as const;

export function resolveContextTurnProducer(
  producer: ContextTurnProducerConfig,
): ResolvedContextTurnProducer {
  return {
    id: producer.id,
    run: producer.run,
    when: {
      ...(producer.when?.channels
        ? { channels: [...producer.when.channels] }
        : {}),
    },
    timeoutMs: producer.timeoutMs ?? TURN_PRODUCER_DEFAULTS.timeoutMs,
    cacheMs: producer.cacheMs ?? TURN_PRODUCER_DEFAULTS.cacheMs,
    maxChars: producer.maxChars ?? TURN_PRODUCER_DEFAULTS.maxChars,
  };
}

export function producerMatchesChannel(
  producer: ResolvedContextTurnProducer,
  channel: string | undefined,
): boolean {
  const channels = producer.when.channels;
  if (!channels) return true;
  if (!channel) return false;
  return channels.some((pattern) => channelMatches(pattern, channel));
}

export interface ContextTurnProducerRunContext {
  runtime: AppRuntime;
  agentId: string;
  channel?: string;
  sessionType: string;
}

export interface ContextTurnProducerRunResult {
  raw: string;
  items: TurnContextItem[];
  error?: string;
}

export async function runContextTurnProducer(
  producer: ResolvedContextTurnProducer,
  ctx: ContextTurnProducerRunContext,
): Promise<ContextTurnProducerRunResult> {
  try {
    const { stdout } = await execAsync(producer.run, {
      cwd: ctx.runtime.paths.workspace,
      timeout: producer.timeoutMs,
      env: {
        ...shrimpyRuntimeChildEnv(ctx.runtime.paths.workspace),
        SHRIMPY_CONTEXT_AGENT: ctx.agentId,
        SHRIMPY_CONTEXT_CHANNEL: ctx.channel ?? "",
        SHRIMPY_CONTEXT_SESSION_TYPE: ctx.sessionType,
      },
      maxBuffer: Math.max(producer.maxChars * 4, 4096),
    });
    const raw = clipContextWithMarker(stdout.trim(), producer.maxChars);
    return {
      raw,
      items: parseProducerOutput(producer.id, raw),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      raw: "",
      items: [{
        id: `producer:${producer.id}:error`,
        summary: `${producer.id}: context producer failed (${error})`,
        inspect: producer.run,
      }],
      error,
    };
  }
}

function parseProducerOutput(producerId: string, output: string): TurnContextItem[] {
  if (!output) return [];
  const parsed = parseJsonOutput(output);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item, index) => parseProducerItem(producerId, item, index));
  }
  if (isRecord(parsed) && Array.isArray(parsed.items)) {
    return parsed.items.flatMap((item, index) => parseProducerItem(producerId, item, index));
  }
  if (isRecord(parsed)) {
    return parseProducerItem(producerId, parsed, 0);
  }
  return output.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `producer:${producerId}:${index}`,
      summary: `${producerId}: ${line}`,
    }));
}

function parseJsonOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

function parseProducerItem(
  producerId: string,
  item: unknown,
  index: number,
): TurnContextItem[] {
  if (typeof item === "string") {
    return [{ id: `producer:${producerId}:${index}`, summary: `${producerId}: ${item}` }];
  }
  if (!isRecord(item)) return [];
  const summary = typeof item.summary === "string"
    ? item.summary
    : typeof item.text === "string"
      ? item.text
      : undefined;
  if (!summary) return [];
  return [{
    id: typeof item.id === "string" ? item.id : `producer:${producerId}:${index}`,
    summary,
    inspect: typeof item.inspect === "string" ? item.inspect : undefined,
  }];
}
