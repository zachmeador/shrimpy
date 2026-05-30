import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdapterRoutingConfig } from "../dist/config/adapter-routing.js";

describe("resolveAdapterRoutingConfig", () => {
  test("returns no routes when config and defaults are omitted", () => {
    assert.deepEqual(resolveAdapterRoutingConfig(), {
      routes: [],
    });
  });

  test("uses provided default routes when config is omitted", () => {
    assert.deepEqual(
      resolveAdapterRoutingConfig(undefined, [
        { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
      ]),
      {
        routes: [{ adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" }],
      },
    );
  });

  test("merges default and custom routes", () => {
    assert.deepEqual(
      resolveAdapterRoutingConfig({
        routes: [
          { adapter: "telegram.helper", channelPrefix: "telegram~helper~" },
          { adapter: "discord", channelPrefix: "discord-" },
        ],
      }, [
        { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
      ]),
      {
        routes: [
          { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
          { adapter: "telegram.helper", channelPrefix: "telegram~helper~" },
          { adapter: "discord", channelPrefix: "discord-" },
        ],
      },
    );
  });

  test("deduplicates identical routes", () => {
    assert.deepEqual(
      resolveAdapterRoutingConfig({
        routes: [
          { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
        ],
      }, [
        { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
      ]),
      {
        routes: [
          { adapter: "telegram.shrimpy", channelPrefix: "telegram~shrimpy~" },
        ],
      },
    );
  });

  test("rejects invalid route entries", () => {
    assert.throws(
      () =>
        resolveAdapterRoutingConfig({
          routes: [{ adapter: "telegram.shrimpy", channelPrefix: "" }],
        }),
      /Expected string length greater or equal to 1/,
    );
    assert.throws(
      () =>
        resolveAdapterRoutingConfig({
          routes: [{ adapter: "", channelPrefix: "sms-" }],
        }),
      /Expected string length greater or equal to 1/,
    );
  });
});
