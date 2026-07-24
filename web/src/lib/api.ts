import type { FileResponse, TreeResponse } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function fetchTree(): Promise<TreeResponse> {
  const r = await fetch("/api/tree");
  if (!r.ok) throw new Error(`tree: ${r.status}`);
  const body: unknown = await r.json();
  return body as TreeResponse;
}

export async function fetchFile(path: string): Promise<FileResponse> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => ({}));
    const detail = isRecord(body) && typeof body.error === "string"
      ? body.error
      : `file: ${r.status}`;
    throw new Error(detail);
  }
  const body: unknown = await r.json();
  return body as FileResponse;
}
