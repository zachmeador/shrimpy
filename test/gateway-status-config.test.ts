import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveGatewayStatusConfig } from "../dist/config/gateway-status.js";

describe("resolveGatewayStatusConfig", () => {
  test("returns empty watched watches when config is omitted", () => {
    assert.deepEqual(resolveGatewayStatusConfig(), {
      watchedWatches: [],
    });
  });

  test("merges custom values", () => {
    assert.deepEqual(
      resolveGatewayStatusConfig({
        watchedWatches: [{
          label: "pulse",
          channel: "ops",
          watchId: "ops/pulse",
        }],
      }),
      {
        watchedWatches: [{
          label: "pulse",
          channel: "ops",
          watchId: "ops/pulse",
        }],
      },
    );
  });

  test("falls back to watch id as label", () => {
    assert.deepEqual(
      resolveGatewayStatusConfig({
        watchedWatches: [{
          channel: "ops",
          watchId: "ops/pulse",
        }],
      }),
      {
        watchedWatches: [{
          label: "ops/pulse",
          channel: "ops",
          watchId: "ops/pulse",
        }],
      },
    );
  });

  test("rejects invalid values", () => {
    assert.throws(
      () => resolveGatewayStatusConfig({
        watchedWatches: [{
          label: "",
          channel: "ops",
          watchId: "ops/pulse",
        }],
      }),
      /Expected string length greater or equal to 1/,
    );
    assert.throws(
      () => resolveGatewayStatusConfig({
        watchedWatches: [
          { label: "pulse", channel: "ops", watchId: "ops/pulse" },
          { label: "pulse", channel: "ops", watchId: "ops/other" },
        ],
      }),
      /duplicate label "pulse"/,
    );
    assert.throws(
      () => resolveGatewayStatusConfig({ badKey: true }),
      /Unexpected property/,
    );
  });
});
