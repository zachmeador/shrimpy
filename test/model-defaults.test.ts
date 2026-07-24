import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveModel } from "../dist/sessions/models.js";

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

function bootstrap(config?: Record<string, unknown>) {
  return {
    modelPolicies: config?.modelPolicies ?? (config ? undefined : {
      coding: {
        candidates: [{ provider: "local_qwen_moe", id: "Qwen3.6-35B-A3B-UD-Q6_K.gguf" }],
      },
    }),
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
  test("uses the agent default model policy when no CLI model is provided", () => {
    assert.equal(
      resolveModel(bootstrap(), undefined, undefined, "coding"),
      a3b,
    );
  });

  test("lets CLI model selection override the agent default", () => {
    assert.equal(
      resolveModel(
        bootstrap(),
        "local_qwen",
        "Qwen3.6-27B-Q6_K.gguf",
        "coding",
      ),
      twentySevenB,
    );
  });

  test("requires a coding policy unless missing defaults are explicitly allowed", () => {
    assert.throws(
      () => resolveModel(bootstrap({}), undefined, undefined, undefined),
      /model policy coding is not configured/,
    );

    assert.equal(
      resolveModel(bootstrap({}), undefined, undefined, undefined, {
        allowMissingDefault: true,
      }),
      undefined,
    );
  });

  test("uses registry fallback only for explicit bootstrap flows", () => {
    assert.equal(
      resolveModel(bootstrap({}), undefined, undefined, undefined, {
        allowRegistryFallback: true,
      }),
      a3b,
    );
  });
});
