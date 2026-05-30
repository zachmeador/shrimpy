import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveModel } from "../dist/sessions/index.js";

const a3b = {
  provider: "local_qwen_moe",
  id: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
  name: "Qwen 3.6 35B A3B UD Q6_K (local MoE)",
};
const twentySevenB = {
  provider: "local_qwen",
  id: "Qwen3.6-27B-Q6_K.gguf",
  name: "Qwen 3.6 27B Q6_K (local)",
};

function bootstrap() {
  return {
    modelRegistry: {
      find(provider: string, id: string) {
        return [a3b, twentySevenB].find((model) =>
          model.provider === provider && model.id === id
        );
      },
      getAvailable() {
        return [a3b, twentySevenB];
      },
    },
  } as any;
}

describe("resolveModel", () => {
  test("uses a configured default model when no CLI model is provided", () => {
    assert.equal(
      resolveModel(bootstrap(), undefined, undefined, {
        provider: "local_qwen_moe",
        id: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
      }),
      a3b,
    );
  });

  test("lets CLI model selection override the configured default", () => {
    assert.equal(
      resolveModel(
        bootstrap(),
        "local_qwen",
        "Qwen3.6-27B-Q6_K.gguf",
        {
          provider: "local_qwen_moe",
          id: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",
        },
      ),
      twentySevenB,
    );
  });
});
