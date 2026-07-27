import type { NodeResponse, TreeResponse } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function fetchTree(): Promise<TreeResponse> {
  const response = await fetch("/api/tree");
  if (!response.ok) throw new Error(`tree: ${response.status}`);
  return await response.json() as TreeResponse;
}

export async function fetchNode(
  id: string,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  const params = new URLSearchParams({ id });
  if (cursor !== undefined) params.set("cursor", String(cursor));
  if (anchor !== undefined) params.set("anchor", anchor);
  const response = await fetch(`/api/node?${params}`);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const detail = isRecord(body) && typeof body.error === "string"
      ? body.error
      : `node: ${response.status}`;
    throw new Error(detail);
  }
  return await response.json() as NodeResponse;
}
