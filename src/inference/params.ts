import { existsSync, readFileSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai";
import { isRecord } from "../util/record.js";

export const INFERENCE_PARAM_NAMES = [
  "temperature",
  "top_p",
  "top_k",
  "min_p",
  "presence_penalty",
  "repeat_penalty",
] as const;

export type InferenceParamName = (typeof INFERENCE_PARAM_NAMES)[number];
export type InferenceParams = Partial<Record<InferenceParamName, number>>;

export interface ModelVariantInference {
  baseModel?: string;
  enableThinking?: boolean;
  params: InferenceParams;
}

export function normalizeInferenceParams(
  raw: unknown,
  label = "inference preset",
): InferenceParams {
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);

  const out: InferenceParams = {};
  const allowed = new Set([...INFERENCE_PARAM_NAMES, "repetition_penalty"]);
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key as InferenceParamName | "repetition_penalty")) {
      throw new Error(`${label}.${key} is not a supported inference parameter`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label}.${key} must be a finite number`);
    }
    const canonical = key === "repetition_penalty" ? "repeat_penalty" : key;
    if (
      canonical === "repeat_penalty" &&
      out.repeat_penalty !== undefined &&
      out.repeat_penalty !== value
    ) {
      throw new Error(`${label} cannot set both repeat_penalty and repetition_penalty`);
    }
    out[canonical as InferenceParamName] = value;
  }

  return out;
}

export function hasInferenceParams(params: InferenceParams | undefined): boolean {
  return Object.keys(params ?? {}).length > 0;
}

export function applyInferenceParamsToPayload(
  payload: unknown,
  params: InferenceParams,
): unknown {
  if (!hasInferenceParams(params)) return payload;
  if (!isRecord(payload)) return payload;
  return { ...payload, ...params };
}

export function resolveModelVariantInference(input: {
  modelsPath?: string;
  model?: Model<Api>;
}): ModelVariantInference | undefined {
  const { modelsPath, model } = input;
  if (!modelsPath || !model || !existsSync(modelsPath)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(modelsPath, "utf-8")) as unknown;
  if (!isRecord(parsed)) return undefined;
  const providers = parsed.providers;
  if (!isRecord(providers)) return undefined;
  const provider = providers[model.provider];
  if (!isRecord(provider)) return undefined;
  const models = Array.isArray(provider.models) ? provider.models : [];
  const modelEntry = models.find((entry) =>
    isRecord(entry) && entry.id === model.id
  );
  if (!isRecord(modelEntry)) return undefined;

  return readModelVariantInference(
    modelEntry,
    `providers.${model.provider}.models.${model.id}`,
  );
}

export function applyCurrentModelVariantInferenceToPayload(
  payload: unknown,
  input: {
    modelsPath?: string;
    model?: Model<Api>;
  },
): unknown {
  return applyModelVariantInferenceToPayload(
    payload,
    resolveModelVariantInference(input),
    input.model,
  );
}

export function applyModelVariantInferenceToPayload(
  payload: unknown,
  inference: ModelVariantInference | undefined,
  model?: Model<Api>,
): unknown {
  if (!inference || !isRecord(payload)) return payload;

  let next: Record<string, unknown> = { ...payload };
  if (inference.baseModel) {
    next.model = inference.baseModel;
  }
  next = applyInferenceParamsToPayload(next, inference.params) as Record<string, unknown>;
  if (inference.enableThinking !== undefined) {
    next = applyEnableThinking(next, inference.enableThinking, model);
  }
  return next;
}

export function parseModelVariantInference(value: unknown): ModelVariantInference | undefined {
  if (!isRecord(value)) return undefined;

  const baseModel = value.baseModel;
  const enableThinking = value.enableThinking;
  const params = value.params;
  if (baseModel !== undefined && typeof baseModel !== "string") return undefined;
  if (enableThinking !== undefined && typeof enableThinking !== "boolean") return undefined;
  if (params !== undefined && !isRecord(params)) return undefined;

  const parsedParams: Partial<Record<InferenceParamName, number>> = {};
  if (isRecord(params)) {
    for (const name of INFERENCE_PARAM_NAMES) {
      const param = params[name];
      if (param === undefined) continue;
      if (typeof param !== "number" || !Number.isFinite(param)) return undefined;
      parsedParams[name] = param;
    }
  }

  return {
    baseModel,
    enableThinking,
    params: parsedParams,
  };
}

function readModelVariantInference(
  modelEntry: Record<string, unknown>,
  label: string,
): ModelVariantInference | undefined {
  const raw = modelEntry.inference;
  const baseModel = modelEntry.baseModel;
  if (baseModel !== undefined && typeof baseModel !== "string") {
    throw new Error(`${label}.baseModel must be a string`);
  }
  if (raw === undefined && baseModel === undefined) return undefined;
  if (raw !== undefined && !isRecord(raw)) {
    throw new Error(`${label}.inference must be an object`);
  }

  const paramsRaw = raw?.params;
  const params = paramsRaw === undefined
    ? {}
    : normalizeInferenceParams(paramsRaw, `${label}.inference.params`);
  const enableThinking = raw?.enableThinking;
  if (enableThinking !== undefined && typeof enableThinking !== "boolean") {
    throw new Error(`${label}.inference.enableThinking must be a boolean`);
  }

  return {
    baseModel,
    enableThinking,
    params,
  };
}

function applyEnableThinking(
  payload: Record<string, unknown>,
  enableThinking: boolean,
  model: Model<Api> | undefined,
): Record<string, unknown> {
  const format = isRecord(model?.compat) && typeof model.compat.thinkingFormat === "string"
    ? model.compat.thinkingFormat
    : undefined;
  if (format === "qwen-chat-template") {
    const existing = isRecord(payload.chat_template_kwargs)
      ? payload.chat_template_kwargs
      : {};
    return {
      ...payload,
      chat_template_kwargs: {
        ...existing,
        enable_thinking: enableThinking,
        preserve_thinking: true,
      },
    };
  }
  if (format === "qwen" || format === "zai") {
    return { ...payload, enable_thinking: enableThinking };
  }
  return payload;
}
