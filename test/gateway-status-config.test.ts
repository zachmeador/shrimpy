import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveGatewayStatusConfig } from "../dist/config/gateway-status.js";

describe("resolveGatewayStatusConfig", () => {
  test("returns defaults when config is omitted", () => {
    assert.deepEqual(resolveGatewayStatusConfig(), {
      heartbeatChannel: "heartbeat",
      heartbeatScheduleId: "shrimpy/heartbeat",
    });
  });

  test("merges custom values", () => {
    assert.deepEqual(
      resolveGatewayStatusConfig({
        heartbeatChannel: "pulse",
        heartbeatScheduleId: "ops.pulse",
      }),
      {
        heartbeatChannel: "pulse",
        heartbeatScheduleId: "ops.pulse",
      },
    );
  });

  test("rejects invalid values", () => {
    assert.throws(
      () => resolveGatewayStatusConfig({ heartbeatChannel: "" }),
      /Expected string length greater or equal to 1/,
    );
    assert.throws(
      () => resolveGatewayStatusConfig({ badKey: true }),
      /Unexpected property/,
    );
  });
});
