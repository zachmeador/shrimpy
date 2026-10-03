import assert from "node:assert/strict";
import { test } from "node:test";
import type { Registration } from "../../contracts/gateway/index.ts";
import { createRegistry, InvalidRegistrationError } from "./registry.ts";

function agent(name: string, socket = `/run/shrimpy/${name}.sock`): Registration {
  return { kind: "agent", name, serverId: `server-${name}`, socket, pid: 100 };
}

const chat: Registration = {
  kind: "chat",
  name: "chat",
  serverId: "server-chat",
  socket: "/run/shrimpy/chat.sock",
  pid: 200,
};

test("a new registry lists nothing", () => {
  assert.deepEqual(createRegistry().list(), []);
});

test("a connection's registration is listed until the connection closes", () => {
  const registry = createRegistry();
  const connection = registry.connect();
  assert.deepEqual(registry.list(), []);

  connection.register(agent("one"));
  assert.deepEqual(registry.list(), [agent("one")]);

  connection.close();
  assert.deepEqual(registry.list(), []);
});

test("registering again on a connection replaces its entry and moves it to the end", () => {
  const registry = createRegistry();
  const first = registry.connect();
  const second = registry.connect();
  first.register(agent("one"));
  second.register(chat);

  first.register(agent("one", "/run/shrimpy/restarted.sock"));

  assert.deepEqual(registry.list(), [chat, agent("one", "/run/shrimpy/restarted.sock")]);
});

test("closing a connection drops only its own entry", () => {
  const registry = createRegistry();
  const first = registry.connect();
  const second = registry.connect();
  first.register(agent("one"));
  second.register(agent("two"));

  first.close();

  assert.deepEqual(registry.list(), [agent("two")]);
});

test("a closed connection cannot register, and closing twice is harmless", () => {
  const registry = createRegistry();
  const connection = registry.connect();
  connection.register(agent("one"));
  connection.close();
  connection.close();

  assert.throws(() => connection.register(agent("one")), /closed/);
  assert.deepEqual(registry.list(), []);
});

test("find returns the newest live registration of a program", () => {
  const registry = createRegistry();
  const old = registry.connect();
  const current = registry.connect();
  old.register(agent("one", "/run/shrimpy/old.sock"));
  current.register(agent("one", "/run/shrimpy/current.sock"));

  assert.equal(registry.find("agent", "one")?.socket, "/run/shrimpy/current.sock");
  assert.equal(registry.find("chat", "one"), undefined);
  assert.equal(registry.find("agent", "other"), undefined);

  current.close();
  assert.equal(registry.find("agent", "one")?.socket, "/run/shrimpy/old.sock");
  old.close();
  assert.equal(registry.find("agent", "one"), undefined);
});

test("the registry hands out copies, so callers cannot change what it holds", () => {
  const registry = createRegistry();
  const given = agent("one");
  registry.connect().register(given);

  given.name = "changed";
  const listed = registry.list();
  assert.ok(listed[0]);
  listed[0].name = "changed too";
  const found = registry.find("agent", "one");
  assert.ok(found);
  found.name = "and again";

  assert.deepEqual(registry.list(), [agent("one")]);
});

test("only the contract's fields are kept", () => {
  const registry = createRegistry();
  registry.connect().register({ ...agent("one"), token: "secret", extra: [1] });

  assert.deepEqual(registry.list(), [agent("one")]);
});

test("a registration that is not well formed is refused and changes nothing", () => {
  const registry = createRegistry();
  const connection = registry.connect();
  connection.register(agent("one"));
  const good = agent("one");
  const refused: [string, unknown][] = [
    ["expected an object", null],
    ["expected an object", "agent"],
    ["kind", { ...good, kind: "gateway" }],
    ["kind", { ...good, kind: undefined }],
    ["name", { ...good, name: "" }],
    ["name", { ...good, name: 7 }],
    ["serverId", { ...good, serverId: "" }],
    ["serverId", { ...good, serverId: undefined }],
    ["socket", { ...good, socket: "relative.sock" }],
    ["socket", { ...good, socket: 5 }],
    ["pid", { ...good, pid: 0 }],
    ["pid", { ...good, pid: -3 }],
    ["pid", { ...good, pid: 1.5 }],
    ["pid", { ...good, pid: "100" }],
    ["pid", { ...good, pid: Number.NaN }],
  ];

  for (const [field, value] of refused) {
    assert.throws(
      () => connection.register(value),
      (error) => error instanceof InvalidRegistrationError && error.message.includes(field),
      JSON.stringify(value),
    );
  }
  assert.deepEqual(registry.list(), [good]);
});
