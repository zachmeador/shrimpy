import type { NodeKind, TreeNode } from "../../shared/types.js";

export function isGroupOpen(
  openGroups: Record<string, boolean>,
  key: string,
): boolean {
  return openGroups[key] ?? key !== "directory:workspace";
}

export function filterTreeNodes(nodes: TreeNode[], value: string): TreeNode[] {
  const query = value.trim().toLocaleLowerCase();
  if (!query) return nodes;

  const filtered: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      const haystack = `${node.name}\n${node.hint ?? ""}`.toLocaleLowerCase();
      if (haystack.includes(query)) filtered.push(node);
      continue;
    }

    const children = filterTreeNodes(node.children, query);
    if (node.name.toLocaleLowerCase().includes(query) || children.length > 0) {
      filtered.push({ ...node, children });
    }
  }
  return filtered;
}

export function collectDirectoryIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type !== "directory") continue;
    ids.push(node.id);
    ids.push(...collectDirectoryIds(node.children));
  }
  return ids;
}

export function impliedLeafKind(
  nodes: TreeNode[],
  parentSynthetic: boolean,
): NodeKind | null {
  if (!parentSynthetic || nodes.length === 0) return null;
  const first = nodes[0];
  if (first?.type !== "file") return null;
  return nodes.every(
    (node) => node.type === "file" && node.kind === first.kind,
  )
    ? first.kind
    : null;
}
