import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { type Context, defineService } from "@earendil-works/chord";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { openConnection } from "../connection/index.ts";
import { offer, startStandIn, until, useRuntimeDir } from "./index.ts";

const timeout = 15_000;

interface Greeter {
  greet(name: string, context: Context): Promise<string>;
}
const Greeter = defineService<Greeter>("shrimpy.test.greeter");

const greeter = { greet: (name: string) => Promise.resolve(`hello, ${name}`) };

test("a stand-in claims a random server ID unless it is given one", { timeout }, async (t) => {
  useRuntimeDir(t);
  const claimed = randomUUID();

  const random = await startStandIn(t, "random", { offer: () => offer(Greeter, greeter) });
  const fixed = await startStandIn(t, "fixed", { serverId: claimed, offer: () => offer(Greeter, greeter) });

  assert.notEqual(random.serverId, claimed);
  assert.equal(fixed.serverId, claimed);
  const connection = await openConnection({
    serverId: claimed,
    transportFactory: createUnixTransportFactory({ path: fixed.socket }),
    service: Greeter,
  });
  await connection.close();
});

test("an offer is told when its connection is let go of, and not before", { timeout }, async (t) => {
  useRuntimeDir(t);
  let released = 0;
  const standIn = await startStandIn(t, "greeter", {
    offer: () =>
      offer(Greeter, greeter, () => {
        released += 1;
      }),
  });
  const connection = await openConnection({
    serverId: standIn.serverId,
    transportFactory: createUnixTransportFactory({ path: standIn.socket }),
    service: Greeter,
  });
  assert.equal(released, 0);

  await connection.close();

  await until(() => released === 1, "the offer to be released");
  assert.equal(standIn.connections(), 0);
});
