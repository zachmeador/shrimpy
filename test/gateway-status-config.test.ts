import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveGatewayStatusConfig } from "../dist/config/gateway-status.js";

describe("resolveGatewayStatusConfig", () => {
  test("returns empty watched schedules when config is omitted", () => {
    assert.deepEqual(resolveGatewayStatusConfig(), {
      watchedSchedules: [],
    });
  });

  test("merges custom values", () => {
    assert.deepEqual(
      resolveGatewayStatusConfig({
        watchedSchedules: [{
          label: "pulse",
          channel: "ops",
          scheduleId: "ops/pulse",
        }],
      }),
      {
        watchedSchedules: [{
          label: "pulse",
          channel: "ops",
          scheduleId: "ops/pulse",
        }],
      },
    );
  });

  test("falls back to schedule id as label", () => {
    assert.deepEqual(
      resolveGatewayStatusConfig({
        watchedSchedules: [{
          channel: "ops",
          scheduleId: "ops/pulse",
        }],
      }),
      {
        watchedSchedules: [{
          label: "ops/pulse",
          channel: "ops",
          scheduleId: "ops/pulse",
        }],
      },
    );
  });

  test("rejects invalid values", () => {
    assert.throws(
      () => resolveGatewayStatusConfig({
        watchedSchedules: [{
          label: "",
          channel: "ops",
          scheduleId: "ops/pulse",
        }],
      }),
      /Expected string length greater or equal to 1/,
    );
    assert.throws(
      () => resolveGatewayStatusConfig({
        watchedSchedules: [
          { label: "pulse", channel: "ops", scheduleId: "ops/pulse" },
          { label: "pulse", channel: "ops", scheduleId: "ops/other" },
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
