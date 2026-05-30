import type { FileResponse, TreeResponse } from "./types";

export async function fetchTree(): Promise<TreeResponse> {
  const r = await fetch("/api/tree");
  if (!r.ok) throw new Error(`tree: ${r.status}`);
  return r.json();
}

export async function fetchFile(path: string): Promise<FileResponse> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `file: ${r.status}`);
  }
  return r.json();
}
