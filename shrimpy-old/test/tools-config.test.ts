import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveToolRuntimeConfig } from "../dist/config/tools.js";

describe("resolveToolRuntimeConfig", () => {
  test("returns defaults when tools config is omitted", () => {
    const resolved = resolveToolRuntimeConfig();
    assert.deepEqual(resolved, {
      sendMessage: {
        defaultActorId: "agent:shrimpy",
      },
      readChannel: {
        defaultLimit: 20,
      },
    });
  });

  test("merges partial overrides", () => {
    const resolved = resolveToolRuntimeConfig({
      sendMessage: { defaultActorId: "agent:gateway" },
      readChannel: { defaultLimit: 50 },
    });

    assert.equal(resolved.sendMessage.defaultActorId, "agent:gateway");
    assert.equal(resolved.readChannel.defaultLimit, 50);
  });

  test("rejects invalid values", () => {
    assert.throws(
      () => resolveToolRuntimeConfig({ readChannel: { defaultLimit: 0 } }),
      /Expected integer to be greater or equal to 1/,
    );
    assert.throws(
      () => resolveToolRuntimeConfig({ sendMessage: { defaultActorId: "" } }),
      /Expected string length greater or equal to 1/,
    );
  });
});
