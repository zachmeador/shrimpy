import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildTree,
  classifyWorkspaceFile,
  type DirectoryNode,
  type FileLeaf,
  type TreeNode,
} from "../dist/web/tree.js";
import { readText } from "../dist/web/read.js";

function findNode(root: DirectoryNode, path: string): TreeNode | undefined {
  const parts = path.split("/");
  let current: TreeNode = root;
  for (const part of parts) {
    if (current.type !== "directory") return undefined;
    const next = current.children.find((child) => child.name === part);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

test("web tree mirrors the workspace layout", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-"));
  await mkdir(join(workspace, "context"), { recursive: true });
  await mkdir(join(workspace, "config"), { recursive: true });
  await mkdir(join(workspace, "channels"), { recursive: true });
  await mkdir(join(workspace, "state", "pi"), { recursive: true });
  await mkdir(join(workspace, "runtime", "logs"), { recursive: true });
  await mkdir(join(
    workspace,
    "agents",
    "shrimpy",
    "sessions",
    "channel",
    "aG9tZQ",
    "ZGVmYXVsdA",
  ), {
    recursive: true,
  });
  await mkdir(join(workspace, "agents", "shrimpy", "vault", "notes"), {
    recursive: true,
  });

  await writeFile(join(workspace, "context", "SYSTEM.md"), "# System\n");
  await writeFile(join(workspace, "context", "USER.md"), "# User\n");
  await writeFile(join(workspace, "context", "WORKSPACE.md"), "# Workspace\n");
  await writeFile(join(workspace, "config", "shrimpy.json"), "{}\n");
  await writeFile(join(workspace, "channels", "home.jsonl"), "{}\n");
  await writeFile(join(workspace, "state", "pi", "auth.json"), "{}\n");
  await writeFile(join(workspace, "state", "pi", "models-store.json"), "{}\n");
  await writeFile(join(workspace, "runtime", "logs", "gateway.log"), "started\n");
  await writeFile(
    join(
      workspace,
      "agents",
      "shrimpy",
      "sessions",
      "channel",
      "aG9tZQ",
      "ZGVmYXVsdA",
      "turn.jsonl",
    ),
    "{}\n",
  );
  await writeFile(
    join(workspace, "agents", "shrimpy", "vault", "notes", "idea.md"),
    "note\n",
  );

  const tree = await buildTree(workspace);
  assert.deepEqual(
    tree.root.children.slice(0, 6).map((node) => node.name),
    ["context", "config", "agents", "channels", "state", "runtime"],
  );

  const context = findNode(tree.root, "context/SYSTEM.md") as FileLeaf;
  assert.equal(context.kind, "markdown");
  assert.equal(context.readable, true);
  const userContext = findNode(tree.root, "context/USER.md") as FileLeaf;
  assert.equal(userContext.kind, "markdown");
  assert.equal(userContext.readable, true);
  const workspaceContext = findNode(tree.root, "context/WORKSPACE.md") as FileLeaf;
  assert.equal(workspaceContext.kind, "markdown");
  assert.equal(workspaceContext.readable, true);

  const channel = findNode(tree.root, "channels/home.jsonl") as FileLeaf;
  assert.equal(channel.kind, "channel");

  const session = findNode(
    tree.root,
    "agents/shrimpy/sessions/channel/aG9tZQ/ZGVmYXVsdA/turn.jsonl",
  ) as FileLeaf;
  assert.equal(session.kind, "session");

  const auth = findNode(tree.root, "state/pi/auth.json") as FileLeaf;
  assert.equal(auth.kind, "private");
  assert.equal(auth.readable, false);
  const modelsStore = findNode(tree.root, "state/pi/models-store.json") as FileLeaf;
  assert.equal(modelsStore.kind, "json");
  assert.equal(modelsStore.readable, true);
});

test("web file classifier and text reader support non-jsonl workspace files", async () => {
  assert.deepEqual(classifyWorkspaceFile("context/SYSTEM.md"), {
    kind: "markdown",
    readable: true,
  });
  assert.deepEqual(classifyWorkspaceFile("runtime/logs/gateway.log"), {
    kind: "log",
    readable: true,
  });
  assert.deepEqual(classifyWorkspaceFile("media/photo.png"), {
    kind: "media",
    readable: false,
  });

  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-"));
  const filePath = join(workspace, "note.md");
  await writeFile(filePath, "hello\n");
  const result = await readText(filePath);
  assert.equal(result.text, "hello\n");
  assert.equal(result.truncated, false);
});
