import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createAgentPaths, type AgentPaths } from "../workspace/paths.js";
import { loadSetupTemplate } from "../setup/templates.js";

export function scaffoldAgentFiles(
  workspace: string,
  agentRoot: string,
  agentId: string,
): void {
  const paths = createAgentPaths(workspace, agentRoot);
  const files = [
    {
      path: paths.soulPath,
      content: renderAgentSoulTemplate(agentId),
    },
    {
      path: join(paths.vaultDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(paths.projectsDir, ".gitkeep"),
      content: "",
    },
  ];

  for (const file of files) {
    if (existsSync(file.path)) continue;
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, "utf-8");
  }
}

function renderAgentSoulTemplate(agentId: string): string {
  if (agentId === "shrimpy") {
    return loadSetupTemplate("workspace/agents/shrimpy/SOUL.md");
  }

  return loadSetupTemplate("scaffold/agent/SOUL.md")
    .replaceAll("{{AGENT_ID}}", agentId)
    .replaceAll("{{AGENT_NAME}}", formatAgentName(agentId));
}

function formatAgentName(agentId: string): string {
  const pretty = agentId
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
  return pretty || agentId;
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
