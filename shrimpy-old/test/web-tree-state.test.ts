import assert from "node:assert/strict";
import { test } from "node:test";
import type { TreeNode } from "../web/src/lib/types.ts";
import {
  collectDirectoryIds,
  filterTreeNodes,
  impliedLeafKind,
  isGroupOpen,
} from "../web/src/lib/tree-state.ts";

const nodes: TreeNode[] = [{
  type: "directory",
  id: "agents",
  name: "Agents",
  fileCount: 2,
  synthetic: true,
  children: [{
    type: "directory",
    id: "sessions",
    name: "Sessions",
    fileCount: 2,
    synthetic: true,
    children: [{
      type: "file",
      id: "active",
      name: "home",
      size: 10,
      mtimeMs: 100,
      kind: "session",
      readable: true,
    }, {
      type: "file",
      id: "archived",
      name: "weekly-report",
      hint: "archived",
      size: 20,
      mtimeMs: 200,
      kind: "session",
      readable: true,
    }],
  }],
}];

test("tree filtering keeps matching leaves and their ancestors", () => {
  const filtered = filterTreeNodes(nodes, "archived");
  assert.equal(filtered[0]?.type, "directory");
  if (filtered[0]?.type !== "directory") return;
  const sessions = filtered[0].children[0];
  assert.equal(sessions?.type, "directory");
  if (sessions?.type !== "directory") return;
  assert.deepEqual(sessions.children.map((node) => node.id), ["archived"]);
  assert.equal(filterTreeNodes(nodes, "missing").length, 0);
});

test("tree state retains first-visit defaults and enumerates groups", () => {
  assert.equal(isGroupOpen({}, "sessions"), true);
  assert.equal(isGroupOpen({}, "directory:workspace"), false);
  assert.equal(isGroupOpen({}, "scope:workspace:skills"), false);
  assert.equal(isGroupOpen({}, "scope:agent:shrimpy:skills/tool"), false);
  assert.equal(isGroupOpen({}, "scope:agent:skills:context"), true);
  assert.equal(isGroupOpen({ sessions: false }, "sessions"), false);
  assert.deepEqual(collectDirectoryIds(nodes), ["agents", "sessions"]);
});

test("a synthetic single-kind group can omit its redundant kind", () => {
  const sessions = nodes[0]?.type === "directory"
    ? nodes[0].children[0]
    : undefined;
  assert.equal(sessions?.type, "directory");
  if (sessions?.type !== "directory") return;
  assert.equal(impliedLeafKind(sessions.children, true), "session");
  assert.equal(impliedLeafKind(sessions.children, false), null);
});
