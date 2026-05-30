/**
 * Bias Pi's auto-compaction summary toward leaving time breadcrumbs.
 *
 * Pi's auto-compaction calls `compact()` internally with `customInstructions=undefined`.
 * The `session_before_compact` hook lets an extension take over: we re-issue Pi's
 * compaction flow with the same preparation, the same provider request payload hook
 * Shrimpy uses for normal turns, and our additional focus text. The result is returned
 * to Pi, which persists it as a normal `compaction` entry.
 *
 * The bias: keep approximate timestamps in the summary so the agent (which is
 * time-aware and has tools to read original channel/session logs by date) can dig
 * back into the source when the summary lacks specifics.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { COMPACTION_SUMMARY_INSTRUCTIONS } from "../src/context/system/compaction.ts";
import { applyModelVariantInferenceToPayload } from "../src/inference/params.ts";
import {
  compactWithProviderRequestHooks,
  readShrimpySessionInference,
} from "../src/sessions/compaction-runner.ts";

interface ShrimpyCompactionPolicy {
  instructions?: string;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", async (event, ctx) => {
    if (!ctx.model) return;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) return;

    const branchEntries = event.branchEntries.length > 0
      ? event.branchEntries
      : ctx.sessionManager.getBranch();
    const policy = readShrimpyCompactionPolicy(branchEntries);
    const inference = readShrimpySessionInference(branchEntries);
    const instructions = [
      COMPACTION_SUMMARY_INSTRUCTIONS,
      policy?.instructions,
    ].filter(Boolean).join("\n\n");
    let payloadModel: { before?: unknown; after?: unknown } | undefined;

    try {
      const result = await compactWithProviderRequestHooks(
        event.preparation,
        ctx.model,
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          customInstructions: instructions,
          signal: event.signal,
          onPayload: (payload, model) => {
            const next = applyModelVariantInferenceToPayload(payload, inference, model);
            payloadModel = {
              before: readPayloadModel(payload),
              after: readPayloadModel(next),
            };
            return next;
          },
        },
      );
      return { compaction: result };
    } catch (error) {
      console.error(
        [
          `[shrimpy-compaction] failed for ${ctx.model.provider}/${ctx.model.id}`,
          `inference=${formatInferenceForError(inference)}`,
          payloadModel
            ? `payloadModel=${String(payloadModel.before)}->${String(payloadModel.after)}`
            : "payloadModel=(not sent)",
          error instanceof Error ? error.message : String(error),
        ].join("; "),
      );
      return { cancel: true };
    }
  });
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

function readPayloadModel(payload: unknown): unknown {
  return isRecord(payload) ? payload.model : undefined;
}

function formatInferenceForError(inference: ReturnType<typeof readShrimpySessionInference>): string {
  if (!inference) return "none";
  const params = Object.entries(inference.params)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return [
    inference.baseModel ? `baseModel=${inference.baseModel}` : undefined,
    inference.enableThinking !== undefined ? `enableThinking=${inference.enableThinking}` : undefined,
    `params=${params || "none"}`,
  ].filter(Boolean).join(" ");
}
