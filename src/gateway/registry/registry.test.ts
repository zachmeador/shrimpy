import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Announcement } from "../../contracts/gateway/index.ts";
import { createRegistry } from "./registry.ts";

function agent(socket: string): Announcement {
  return { kind: "agent", serverId: randomUUID(), socket, version: "1.2.3" };
}

test("find returns the newest live registration of a program, by the member's name as it is now", () => {
  const names = new Map([["mem_one", "one"]]);
  const registry = createRegistry({ nameOf: (memberId) => names.get(memberId) });
  const old = registry.connect();
  const current = registry.connect();
  old.register(agent("/run/shrimpy/old.sock"), "mem_one");
  current.register(agent("/run/shrimpy/current.sock"), "mem_one");

  assert.equal(registry.find("agent", "one")?.socket, "/run/shrimpy/current.sock");
  assert.equal(registry.find("chat", "one"), undefined);
  assert.equal(registry.find("agent", "other"), undefined);
  assert.deepEqual(registry.names(), [{ kind: "agent", name: "one" }], "two registrations of one name are one program");

  names.set("mem_one", "uno");
  assert.equal(registry.find("agent", "one"), undefined);
  assert.equal(registry.find("agent", "uno")?.socket, "/run/shrimpy/current.sock");

  current.close();
  assert.equal(registry.find("agent", "uno")?.socket, "/run/shrimpy/old.sock");
  old.close();
  assert.equal(registry.find("agent", "uno"), undefined);
});
