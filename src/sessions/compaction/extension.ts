import {
  type ExtensionFactory,
  type ModelRuntime,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { compactionSummaryInstructions } from "../../instructions/index.js";
import { compactSessionHistory } from "./runner.js";

interface ShrimpyCompactionPolicy {
  instructions?: string;
}

export function createCompactionBiasExtensionFactory(
  modelRuntime: ModelRuntime,
  settingsManager: SettingsManager,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_before_compact", async (event, ctx) => {
      if (!ctx.model) return;

      const branchEntries = event.branchEntries.length > 0
        ? event.branchEntries
        : ctx.sessionManager.getBranch();
      const policy = readShrimpyCompactionPolicy(branchEntries);
      const instructions = [
        compactionSummaryInstructions.render(),
        policy?.instructions,
      ].filter(Boolean).join("\n\n");
      const modelLabel = `${ctx.model.provider}/${ctx.model.id}`;
      const model = ctx.model as Model<Api>;

      try {
        const result = await compactSessionHistory(
          event.preparation,
          model,
          {
            customInstructions: instructions,
            sessionSystemPrompt: ctx.getSystemPrompt(),
            signal: event.signal,
            retry: settingsManager.getRetrySettings(),
            retryCallbacks: {
              onRetryScheduled: (attempt, maxAttempts, delayMs, errorMessage) => {
                console.warn(
                  `[shrimpy-compaction] retry ${attempt}/${maxAttempts} for ${modelLabel} in ${delayMs}ms; ${errorMessage}`,
                );
              },
              onRetryFinished: (success, attempt, finalError) => {
                if (success) return;
                console.error(
                  `[shrimpy-compaction] retries exhausted after ${attempt} for ${modelLabel}; ${finalError ?? "unknown error"}`,
                );
              },
            },
            complete: (model, context, options) =>
              modelRuntime.completeSimple(model, context, options),
          },
        );
        return { compaction: result };
      } catch (error) {
        console.error(
          [
            `[shrimpy-compaction] failed for ${modelLabel}`,
            error instanceof Error ? error.message : String(error),
          ].join("; "),
        );
        return { cancel: true };
      }
    });
  };
}

function readShrimpyCompactionPolicy(
  branchEntries: unknown[],
): ShrimpyCompactionPolicy | undefined {
  for (let index = branchEntries.length - 1; index >= 0; index--) {
    const entry = branchEntries[index];
    if (!isRecord(entry)) continue;
    if (entry.type !== "custom") continue;
    if (entry.customType !== "shrimpy_compaction_policy") continue;
    if (!isRecord(entry.data)) return undefined;
    return typeof entry.data.instructions === "string"
      ? { instructions: entry.data.instructions }
      : {};
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
