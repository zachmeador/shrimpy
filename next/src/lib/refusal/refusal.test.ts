import assert from "node:assert/strict";
import { test } from "node:test";
import { type Context, defineService, RemoteServiceError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { openConnection } from "../connection/index.ts";
import { offer, startStandIn, stopAfter, useRuntimeDir } from "../testing/index.ts";
import { refuse, Refusal } from "./index.ts";

const timeout = 15_000;

test("a refusal is a service error that carries its reason", () => {
  const refusal = new Refusal("Not that.");

  assert.ok(refusal instanceof RemoteServiceError);
  assert.equal(refusal.message, "Not that.");
  assert.equal(refusal.code, "service_invalid_value");
  assert.equal(refusal.name, "Refusal");
  assert.equal(new Refusal("Who are you?", "service_not_allowed").code, "service_not_allowed");
});

test("refuse throws a refusal", () => {
  assert.throws(() => refuse("Not that."), (error) => error instanceof Refusal && error.message === "Not that.");
  assert.throws(() => refuse("Not now.", "service_not_allowed"), { name: "Refusal", code: "service_not_allowed" });
});

interface Doorman {
  turnAway(context: Context): Promise<void>;
  turnAwayForNow(context: Context): Promise<void>;
  crash(context: Context): Promise<void>;
}
const Doorman = defineService<Doorman>("shrimpy.test.doorman");

test("a refusal reaches the caller over a socket with its reason, and any other error does not", { timeout }, async (t) => {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "doorman", {
    offer: () =>
      offer(Doorman, {
        turnAway: () => Promise.resolve().then(() => refuse("Not on the list.")),
        turnAwayForNow: () => Promise.resolve().then(() => refuse("Come back later.", "service_not_allowed")),
        crash: () => Promise.reject(new Error("the database is on fire")),
      }),
  });
  const connection = await openConnection({
    serverId: standIn.serverId,
    transportFactory: createUnixTransportFactory({ path: standIn.socket }),
    service: Doorman,
  });
  stopAfter(t, () => connection.close());
  const doorman = connection.service;

  await assert.rejects(doorman.turnAway(BACKGROUND_CONTEXT), {
    code: "service_invalid_value",
    message: "Not on the list.",
  });
  await assert.rejects(doorman.turnAwayForNow(BACKGROUND_CONTEXT), {
    code: "service_not_allowed",
    message: "Come back later.",
  });
  await assert.rejects(doorman.crash(BACKGROUND_CONTEXT), {
    code: "internal_error",
    message: "Internal server error",
  });
});
