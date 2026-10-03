import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import { decodeUri } from "../../lib/uri/index.ts";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

export interface StaticFiles {
  /** Answer one request. A path that is missing or leads outside the directory is a 404. */
  serve(request: IncomingMessage, response: ServerResponse): Promise<void>;
}

/**
 * Serve the files under `directory`, with `index.html` for a directory. A
 * file is served only if its real path, after links are followed, is inside
 * the directory, so neither `..` nor a link can reach anything outside it.
 */
export async function staticFiles(directory: string): Promise<StaticFiles> {
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) throw new Error(`${directory} is not a directory`);
  return {
    async serve(request, response) {
      const method = request.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD", "Content-Length": 0 }).end();
        return;
      }
      const file = await locate(root, request.url ?? "/");
      if (file === undefined) {
        response.writeHead(404, { "Content-Length": 0 }).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(file.path)] ?? "application/octet-stream",
        "Content-Length": file.size,
        "X-Content-Type-Options": "nosniff",
      });
      if (method === "HEAD") response.end();
      else pipeline(createReadStream(file.path), response, () => undefined);
    },
  };
}

async function locate(
  root: string,
  url: string,
): Promise<{ path: string; size: number } | undefined> {
  const requested = decodeUri(url.split("?", 1)[0] ?? "");
  if (requested === undefined || requested.includes("\0")) return undefined;
  try {
    // The leading dot keeps even a path like `//etc/passwd` relative to the root.
    let path = await realpath(resolve(root, `.${requested}`));
    if (!isInside(root, path)) return undefined;
    let info = await stat(path);
    if (info.isDirectory()) {
      path = await realpath(join(path, "index.html"));
      if (!isInside(root, path)) return undefined;
      info = await stat(path);
    }
    return info.isFile() ? { path, size: info.size } : undefined;
  } catch {
    return undefined;
  }
}

function isInside(root: string, path: string): boolean {
  const from = relative(root, path);
  return from !== ".." && !from.startsWith(`..${sep}`) && !isAbsolute(from);
}
