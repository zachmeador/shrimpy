import assert from "node:assert/strict";
import { test } from "node:test";
import { isServerId } from "@earendil-works/pi-protocol";
import {
  GATEWAY_SERVER_ID,
  isProgramKind,
  parseWebSocketPath,
  type WebTarget,
  webSocketPath,
} from "./endpoint.ts";

test("the gateway's server ID is one the protocol accepts", () => {
  assert.ok(isServerId(GATEWAY_SERVER_ID));
});

test("only the kinds of program that register are program kinds", () => {
  assert.ok(isProgramKind("agent"));
  assert.ok(isProgramKind("chat"));
  for (const other of ["gateway", "", "toString", "__proto__", 42, undefined, null]) {
    assert.equal(isProgramKind(other), false, String(other));
  }
});

test("a path names the target it was made from", () => {
  const targets: WebTarget[] = [
    "gateway",
    { kind: "agent", name: "researcher" },
    { kind: "chat", name: "chat" },
    { kind: "agent", name: "a name/with a slash" },
    { kind: "agent", name: "100% ünïcode ☃" },
    { kind: "agent", name: "a?b#c" },
  ];
  for (const target of targets) {
    assert.deepEqual(parseWebSocketPath(webSocketPath(target)), target, webSocketPath(target));
  }
  assert.equal(webSocketPath({ kind: "agent", name: "a/b" }), "/ws/agent/a%2Fb");
});

test("paths that name no target are refused", () => {
  const paths = [
    "",
    "/",
    "/ws",
    "/ws/",
    "/ws/agent",
    "/ws/agent/",
    "/ws/agent/a/b",
    "/ws/gateway/",
    "/ws/gateway/x",
    "/ws/robot/a",
    "/WS/gateway",
    "ws/gateway",
    "//ws/gateway",
    "/other/agent/a",
    "/ws/agent/%E0%A4%A",
  ];
  for (const path of paths) assert.equal(parseWebSocketPath(path), undefined, path);
});
