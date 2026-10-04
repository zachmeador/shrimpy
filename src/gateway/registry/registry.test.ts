import assert from "node:assert/strict";
import { test } from "node:test";
import type { Registration } from "../../contracts/gateway/index.ts";
import { createRegistry } from "./registry.ts";

function agent(name: string, socket = `/run/shrimpy/${name}.sock`): Registration {
  return { kind: "agent", name, serverId: `server-${name}`, socket, pid: 100, version: "1.2.3" };
}

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
