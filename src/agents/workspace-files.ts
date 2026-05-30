import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createAgentPaths, type AgentPaths } from "../app/paths.js";
import { loadSetupTemplate } from "../setup/templates.js";
import { renderSoulTemplate } from "../context/index.js";

export function scaffoldAgentFiles(
  workspace: string,
  agentRoot: string,
  agentId: string,
): void {
  const paths = createAgentPaths(workspace, agentRoot);
  const files = [
    {
      path: paths.soulPath,
      content: renderSoulTemplate(agentId),
    },
    {
      path: join(paths.contextDir, "identity.md"),
      content: loadSetupTemplate("context/identity.md", ""),
    },
    {
      path: join(paths.contextDir, "habits.md"),
      content: loadSetupTemplate("context/habits.md", ""),
    },
  ];

  for (const file of files) {
    if (existsSync(file.path)) continue;
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, "utf-8");
  }
}

export function deleteAgentWorkspaceFiles(
  paths: Pick<AgentPaths, "root">,
): string[] {
  const deletedPaths: string[] = [];
  if (existsSync(paths.root)) {
    rmSync(paths.root, { recursive: true, force: true });
    deletedPaths.push(paths.root);
  }

  return deletedPaths;
}

export function moveAgentWorkspaceFiles(
  previousPaths: Pick<AgentPaths, "root">,
  nextPaths: Pick<AgentPaths, "root">,
): Array<{ from: string; to: string }> {
  const candidates = new Map<string, string>();
  if (previousPaths.root !== nextPaths.root) {
    candidates.set(previousPaths.root, nextPaths.root);
  }

  const moves = [...candidates.entries()]
    .map(([from, to]) => ({ from, to }))
    .filter(({ from }) => existsSync(from))
    .sort((a, b) => b.from.length - a.from.length);

  for (const move of moves) {
    if (existsSync(move.to)) {
      throw new Error(`rename target already exists: ${move.to}`);
    }
  }

  for (const move of moves) {
    mkdirSync(dirname(move.to), { recursive: true });
    renameSync(move.from, move.to);
  }

  return moves;
}
