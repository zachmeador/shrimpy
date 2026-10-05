import assert from "node:assert/strict";
import { test } from "node:test";
import { type Context, defineService } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { openConnection } from "../connection/index.ts";
import { offer, startStandIn, stopAfter, useRuntimeDir } from "../testing/index.ts";
import { isRefusal, reasonOf, refuse } from "./index.ts";

const timeout = 15_000;

interface Doorman {
  turnAway(context: Context): Promise<void>;
  turnAwayForNow(context: Context): Promise<void>;
  turnAwayBecause(context: Context): Promise<void>;
  crash(context: Context): Promise<void>;
}
const Doorman = defineService<Doorman>("shrimpy.test.doorman");

test("a refusal reaches the caller over a socket with its message and the case it names, and any other error does not", { timeout }, async (t) => {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "doorman", {
    offer: () =>
      offer(Doorman, {
        turnAway: () => Promise.resolve().then(() => refuse("Not on the list.")),
        turnAwayForNow: () => Promise.resolve().then(() => refuse("Come back later.", "service_not_allowed")),
        turnAwayBecause: () => Promise.resolve().then(() => refuse("Full tonight.", "service_not_allowed", "full")),
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

  await assert.rejects(doorman.turnAway(BACKGROUND_CONTEXT), (error: unknown) => {
    assert.ok(isRefusal(error), "a caller can tell it was refused");
    assert.deepEqual([error.code, error.message], ["service_invalid_value", "Not on the list."]);
    assert.equal(reasonOf(error), undefined);
    return true;
  });
  await assert.rejects(doorman.turnAwayForNow(BACKGROUND_CONTEXT), (error: unknown) => {
    assert.ok(isRefusal(error));
    assert.deepEqual([error.code, error.message], ["service_not_allowed", "Come back later."]);
    return true;
  });
  await assert.rejects(doorman.turnAwayBecause(BACKGROUND_CONTEXT), (error: unknown) => {
    assert.ok(isRefusal(error), "a refusal that names its case is still a refusal");
    assert.deepEqual([reasonOf(error), error.message], ["full", "Full tonight."]);
    return true;
  });
  await assert.rejects(doorman.crash(BACKGROUND_CONTEXT), (error: unknown) => {
    assert.ok(!isRefusal(error), "a failure that is not a refusal is not taken for one");
    assert.equal(reasonOf(error), undefined);
    assert.deepEqual([(error as { code?: unknown }).code, (error as Error).message], ["internal_error", "Internal server error"]);
    return true;
  });
});
