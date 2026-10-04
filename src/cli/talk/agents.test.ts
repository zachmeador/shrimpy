import assert from "node:assert/strict";
import { test } from "node:test";
import type { Registration } from "../../contracts/gateway/index.ts";
import { registeredAgent } from "./agents.ts";

function program(kind: Registration["kind"], name: string, pid: number): Registration {
  return { kind, name, serverId: "00000000-0000-4000-8000-000000000000", socket: `/tmp/${name}.sock`, pid, version: "0.0.0" };
}

test("the agent with the name is found, the newest of two with one name is the one reached, and a chat server is not an agent", () => {
  const programs = [program("agent", "scout", 1), program("chat", "chat", 2), program("agent", "scout", 3)];

  assert.equal(registeredAgent(programs, "scout").pid, 3);
  assert.throws(() => registeredAgent(programs, "chat"), /No agent named chat is registered/);
});
