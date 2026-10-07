import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWebSocketPath, parseWebSocketRequest, type WebTarget, webSocketPath } from "./endpoint.ts";

test("a path names the target it was made from, and a path that names nothing the gateway serves is refused", () => {
  const targets: WebTarget[] = [
    "gateway",
    { kind: "agent", name: "researcher" },
    { kind: "agent", name: "a name/with a slash" },
    { kind: "chat", name: "100% ünïcode ☃" },
  ];
  for (const target of targets) {
    assert.deepEqual(parseWebSocketPath(webSocketPath(target)), target, webSocketPath(target));
  }

  // Not a kind of program (an object's own property names are not kinds either), not a whole path, or an escape that is not valid.
  for (const path of ["", "/ws/agent", "/ws/agent/a/b", "/ws/robot/a", "/ws/toString/a", "/ws/agent/%E0%A4%A"]) {
    assert.equal(parseWebSocketPath(path), undefined, path);
  }
});

test("a request to the network entry names its target and carries its ticket, whatever the ticket's characters", () => {
  const target = { kind: "agent", name: "a name/with a slash" } as const;
  for (const ticket of ["Zx-_09abc", "a b&c=d?e#f%g+h"]) {
    assert.deepEqual(parseWebSocketRequest(webSocketPath(target, ticket)), { target, ticket });
  }
  assert.deepEqual(parseWebSocketRequest(webSocketPath(target)), { target, ticket: undefined });
  assert.deepEqual(parseWebSocketRequest(webSocketPath("gateway")), { target: "gateway", ticket: undefined });
  assert.equal(parseWebSocketRequest("/ws/robot/a?ticket=x"), undefined);
});
