import assert from "node:assert/strict";
import { test } from "node:test";
import type { Announcement } from "../../contracts/gateway/index.ts";
import { createRegistry } from "./registry.ts";

function agent(name: string, socket = `/run/shrimpy/${name}.sock`): Announcement {
  return { kind: "agent", serverId: `server-${name}`, socket, pid: 100, version: "1.2.3" };
}

test("find returns the newest live registration of a program, by the member's name as it is now", () => {
  const names = new Map([["mem_one", "one"]]);
  const registry = createRegistry({ nameOf: (memberId) => names.get(memberId) });
  const old = registry.connect();
  const current = registry.connect();
  old.register(agent("one", "/run/shrimpy/old.sock"), "mem_one");
  current.register(agent("one", "/run/shrimpy/current.sock"), "mem_one");

  assert.equal(registry.find("agent", "one")?.socket, "/run/shrimpy/current.sock");
  assert.equal(registry.find("chat", "one"), undefined);
  assert.equal(registry.find("agent", "other"), undefined);

  names.set("mem_one", "uno");
  assert.equal(registry.find("agent", "one"), undefined);
  assert.equal(registry.find("agent", "uno")?.socket, "/run/shrimpy/current.sock");

  current.close();
  assert.equal(registry.find("agent", "uno")?.socket, "/run/shrimpy/old.sock");
  old.close();
  assert.equal(registry.find("agent", "uno"), undefined);
});
