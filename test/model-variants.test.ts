import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCurrentModelVariantInferenceToPayload,
  applyModelVariantInferenceToPayload,
  applyInferenceParamsToPayload,
  resolveModelVariantInference,
} from "../dist/inference/params.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-model-variants-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const qwenModel = {
  provider: "local_qwen_moe",
  id: "qwen-a3b:thinking-coding",
  api: "openai-completions",
  compat: {
    thinkingFormat: "qwen-chat-template",
  },
};

const codexModel = {
  provider: "openai-codex",
  id: "gpt-5.5",
  api: "openai-codex-responses",
};

function writeModelsJson(value: unknown): string {
  const path = join(testDir, "models.json");
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
  return path;
}

describe("model variant inference", () => {
  test("resolves variant inference metadata from the selected model entry", () => {
    const modelsPath = writeModelsJson({
      providers: {
        local_qwen_moe: {
          models: [
            {
              id: qwenModel.id,
              baseModel: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
              inference: {
                enableThinking: true,
                params: {
                  temperature: 0.6,
                  top_p: 0.95,
                  top_k: 20,
                  min_p: 0,
                  presence_penalty: 0,
                  repetition_penalty: 1,
                },
              },
            },
          ],
        },
      },
    });

    const inference = resolveModelVariantInference({
      modelsPath,
      model: qwenModel as any,
    });

    assert.deepEqual(inference, {
      baseModel: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
      enableThinking: true,
      params: {
        temperature: 0.6,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 0,
        repeat_penalty: 1,
      },
    });
  });

  test("applies variant metadata to the provider payload", () => {
    const payload = applyModelVariantInferenceToPayload(
      { model: "qwen-a3b:thinking-coding", stream: true },
      {
        baseModel: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
        enableThinking: true,
        params: {
          temperature: 0.6,
          top_p: 0.95,
        },
      },
      qwenModel as any,
    );

    assert.deepEqual(payload, {
      model: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
      stream: true,
      temperature: 0.6,
      top_p: 0.95,
      chat_template_kwargs: {
        enable_thinking: true,
        preserve_thinking: true,
      },
    });
  });

  test("applies variant metadata for the current model only", () => {
    const modelsPath = writeModelsJson({
      providers: {
        local_qwen_moe: {
          models: [
            {
              id: qwenModel.id,
              baseModel: "dense",
              inference: {
                enableThinking: false,
              },
            },
          ],
        },
        "openai-codex": {
          models: [
            {
              id: codexModel.id,
            },
          ],
        },
      },
    });

    assert.deepEqual(
      applyCurrentModelVariantInferenceToPayload(
        { model: qwenModel.id, stream: true },
        { modelsPath, model: qwenModel as any },
      ),
      {
        model: "dense",
        stream: true,
        chat_template_kwargs: {
          enable_thinking: false,
          preserve_thinking: true,
        },
      },
    );

    assert.deepEqual(
      applyCurrentModelVariantInferenceToPayload(
        { model: codexModel.id, stream: true },
        { modelsPath, model: codexModel as any },
      ),
      { model: codexModel.id, stream: true },
    );
  });

  test("applies selected params to the provider payload", () => {
    assert.deepEqual(
      applyInferenceParamsToPayload(
        { model: "qwen", stream: true },
        { temperature: 0.6, top_p: 0.95 },
      ),
      { model: "qwen", stream: true, temperature: 0.6, top_p: 0.95 },
    );
  });

  test("returns undefined when the selected model has no variant metadata", () => {
    const modelsPath = writeModelsJson({
      providers: {
        local_qwen_moe: {
          models: [{ id: qwenModel.id }],
        },
      },
    });

    assert.equal(
      resolveModelVariantInference({
        modelsPath,
        model: qwenModel as any,
      }),
      undefined,
    );
  });
});
