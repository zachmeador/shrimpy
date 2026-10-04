import assert from "node:assert/strict";
import { test } from "node:test";
import { RemoteServiceError } from "@earendil-works/chord";
import { DisconnectedError } from "@earendil-works/pi-client";
import { Refusal } from "../../lib/refusal/index.ts";
import { isRefusal } from "./index.ts";

test("a refusal is an answer that said no for a reason asking again will not change", () => {
  assert.equal(isRefusal(new Refusal("Unknown thread: th_1")), true);
  assert.equal(isRefusal(new Refusal("Say who you are first", "service_not_allowed")), true);
});

test("a lost connection, a missing service and an ordinary error are not refusals", () => {
  assert.equal(isRefusal(new DisconnectedError()), false);
  assert.equal(isRefusal(new RemoteServiceError("service_not_found", "No such service")), false);
  assert.equal(isRefusal(new Error("nope")), false);
  assert.equal(isRefusal("service_invalid_value"), false);
});
