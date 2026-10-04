import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { type Context, defineService, type ReplicatedState, replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import {
  type Freezable,
  freezable,
  offer,
  settle,
  startStandIn,
  stopAfter,
  until,
  useRuntimeDir,
  within,
} from "../testing/index.ts";
import { openConnection, openRoutedConnection } from "./index.ts";

const timeout = 15_000;
const context = BACKGROUND_CONTEXT;

interface Greeter {
  greet(name: string, context: Context): Promise<string>;
  wait(context: Context): Promise<void>;
}
const Greeter = defineService<Greeter>("shrimpy.test.greeter");

interface Directory {
  attach(routeId: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
}
const Directory = defineService<Directory>("shrimpy.test.directory");

interface Room {
  readonly state: ReplicatedState<{ topic: string }>;
}
const Room = defineService<Room>("shrimpy.test.room");

const transport = (standIn: { socket: string }) => createUnixTransportFactory({ path: standIn.socket });

/** A program whose one service answers greetings. A `wait` never gets its answer. */
async function startGreeter(t: TestContext) {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "greeter", {
    offer: () =>
      offer(Greeter, {
        greet: (name) => Promise.resolve(`hello, ${name}`),
        wait: () => new Promise<void>(() => undefined),
      }),
  });
  const connection = await openConnection({
    serverId: standIn.serverId,
    transportFactory: transport(standIn),
    service: Greeter,
  });
  stopAfter(t, () => connection.close());
  return { standIn, connection };
}

test("a connection calls the program's service", { timeout }, async (t) => {
  const { connection } = await startGreeter(t);

  assert.equal(await connection.service.greet("Zach", context), "hello, Zach");
});

test("listeners hear when the program goes away", { timeout }, async (t) => {
  const { standIn, connection } = await startGreeter(t);
  const reasons: (Error | undefined)[] = [];
  connection.onDisconnect((reason) => reasons.push(reason));

  await standIn.close();
  await until(() => reasons.length > 0, "the connection to end");
  await connection.close();

  assert.equal(reasons.length, 1);
});

test("a program that does not offer the service is refused, and the connection is closed", { timeout }, async (t) => {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "directory", {
    offer: () => offer(Directory, { attach: () => Promise.resolve(), detach: () => Promise.resolve() }),
  });

  await assert.rejects(
    openConnection({ serverId: standIn.serverId, transportFactory: transport(standIn), service: Greeter }),
  );

  await until(() => standIn.connections() === 0, "the refused connection to close");
});

test("closing without saying goodbye does not wait for a call that is waiting for its answer", { timeout }, async (t) => {
  const { connection } = await startGreeter(t);
  const waiting = assert.rejects(connection.service.wait(context));
  await settle();

  await connection.close({ goodbye: false });

  await waiting;
});

/** A connection that is made, and then the server stops answering. */
async function startFrozenGreeter(t: TestContext) {
  useRuntimeDir(t);
  const standIn = await startStandIn(t, "greeter", {
    offer: () => offer(Greeter, { greet: (name) => Promise.resolve(`hello, ${name}`), wait: () => Promise.resolve() }),
  });
  const reachable = freezable(transport(standIn));
  return { standIn, reachable };
}

/** More than a goodbye gets, and well under what a goodbye that is waited for forever would take. */
const GOODBYE_BOUND_MS = 4000;

test("connecting can be given up on while the server takes the connection and never answers", { timeout }, async (t) => {
  const { standIn, reachable } = await startFrozenGreeter(t);
  reachable.freeze();
  const giveUp = new AbortController();

  const connecting = openConnection({
    serverId: standIn.serverId,
    transportFactory: reachable.transportFactory,
    service: Greeter,
    signal: giveUp.signal,
  });
  const failed = assert.rejects(connecting, { name: "AbortError" });
  await until(() => standIn.connections() === 1, "the server to take the connection");
  giveUp.abort();

  await within(GOODBYE_BOUND_MS, failed, "connecting giving up");
  await until(() => standIn.connections() === 0, "the half-made connection to be dropped");
});

test("saying goodbye to a server that has stopped answering is given up on, and the connection is dropped", { timeout }, async (t) => {
  const { standIn, reachable } = await startFrozenGreeter(t);
  const connection = await openConnection({
    serverId: standIn.serverId,
    transportFactory: reachable.transportFactory,
    service: Greeter,
  });
  reachable.freeze();

  await within(GOODBYE_BOUND_MS, connection.close(), "closing");

  await until(() => standIn.connections() === 0, "the connection to be dropped");
});

/**
 * A program that routes connections: every route whose ID starts with `room`
 * is a room, and the rest do not exist.
 */
async function startRooms(
  t: TestContext,
  via: (factory: ByteTransportFactory) => ByteTransportFactory = (factory) => factory,
) {
  useRuntimeDir(t);
  let detached = 0;
  const standIn = await startStandIn(t, "rooms", {
    offer: (presentation) =>
      offer(Directory, {
        attach: (routeId, callContext) => presentation.attachSession(routeId, callContext),
        detach: (callContext) => {
          detached += 1;
          return presentation.detachSession(callContext);
        },
      }),
    route: (routeId) =>
      routeId.startsWith("room") ? offer(Room, { state: replicatedState({ topic: routeId }) }) : undefined,
  });
  const connection = await openRoutedConnection({
    serverId: standIn.serverId,
    transportFactory: via(transport(standIn)),
    service: Directory,
    route: Room,
  });
  stopAfter(t, () => connection.close());
  return { connection, standIn, detached: () => detached };
}

test("attaching binds the route's service, and the attachment lasts until it is let go", { timeout }, async (t) => {
  const { connection, detached } = await startRooms(t);

  const lobby = await connection.attach("room-lobby");
  assert.deepEqual(lobby.service.state.value, { topic: "room-lobby" });
  assert.equal(lobby.isCurrent(), true);

  const kitchen = await connection.attach("room-kitchen");
  assert.equal(lobby.isCurrent(), false);
  assert.deepEqual(kitchen.service.state.value, { topic: "room-kitchen" });
  assert.equal(detached(), 1);

  await connection.detach();
  assert.equal(kitchen.isCurrent(), false);
  assert.equal(detached(), 2);
  await connection.detach();
  assert.equal(detached(), 2);

  const again = await connection.attach("room-lobby");
  assert.equal(again.isCurrent(), true);
  await connection.close();
  assert.equal(again.isCurrent(), false);
});

test("an attach whose route does not offer the service is let go of", { timeout }, async (t) => {
  useRuntimeDir(t);
  let detached = 0;
  const standIn = await startStandIn(t, "rooms", {
    offer: (presentation) =>
      offer(Directory, {
        attach: (routeId, callContext) => presentation.attachSession(routeId, callContext),
        detach: (callContext) => {
          detached += 1;
          return presentation.detachSession(callContext);
        },
      }),
    route: () => offer(Greeter, { greet: () => Promise.resolve(""), wait: () => Promise.resolve() }),
  });
  const connection = await openRoutedConnection({
    serverId: standIn.serverId,
    transportFactory: transport(standIn),
    service: Directory,
    route: Room,
  });
  stopAfter(t, () => connection.close());

  await assert.rejects(connection.attach("anything"));

  assert.equal(detached, 1);
});

test("closing an attached connection to a server that has stopped answering does not wait for it", { timeout }, async (t) => {
  let reachable: Freezable | undefined;
  const { connection, standIn } = await startRooms(t, (factory) => {
    reachable = freezable(factory);
    return reachable.transportFactory;
  });
  const attachment = await connection.attach("room-lobby");
  reachable?.freeze();
  const started = Date.now();

  await within(GOODBYE_BOUND_MS, connection.close(), "closing");

  assert.equal(attachment.isCurrent(), false);
  // A goodbye that ran out of time is not followed by a second one that would take as long again.
  assert.ok(Date.now() - started < 1800, `closing took ${Date.now() - started} ms`);
  await until(() => standIn.connections() === 0, "the connection to be dropped");
});
