#!/usr/bin/env node
import { existsSync, promises as fs, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, classifyWorkspaceFile } from "./tree.js";
import { readJsonl, readText } from "./read.js";

interface Args {
  port: number;
  host: string;
  workspace: string;
  apiOnly: boolean;
}

function resolveWorkspace(override?: string): string {
  if (override) return resolve(override);
  const pointerPath = join(homedir(), ".shrimpy-workspace.json");
  if (existsSync(pointerPath)) {
    const raw = JSON.parse(readFileSync(pointerPath, "utf-8"));
    if (raw.workspace) return raw.workspace;
  }
  return join(process.cwd(), ".shrimpy");
}

function parseArgs(argv: string[]): Args {
  let port = 5174;
  let host = "127.0.0.1";
  let workspaceOverride: string | undefined;
  let apiOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") port = Number(argv[++i]);
    else if (a?.startsWith("--port=")) port = Number(a.slice(7));
    else if (a === "--host") host = String(argv[++i]);
    else if (a?.startsWith("--host=")) host = a.slice(7);
    else if (a === "--workspace") workspaceOverride = String(argv[++i]);
    else if (a?.startsWith("--workspace=")) workspaceOverride = a.slice(12);
    else if (a === "--api-only") apiOnly = true;
    else if (a === "-h" || a === "--help") {
      console.log(
        "shrimpy-web [--port=5174] [--host=127.0.0.1] [--workspace=/path] [--api-only]",
      );
      process.exit(0);
    }
  }
  return { port, host, workspace: resolveWorkspace(workspaceOverride), apiOnly };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function safeJoin(workspace: string, rel: string): string | null {
  const resolved = resolve(workspace, rel);
  if (resolved !== workspace && !resolved.startsWith(workspace + "/")) return null;
  return resolved;
}

async function serveStatic(
  publicDir: string,
  urlPath: string,
  res: ServerResponse,
): Promise<boolean> {
  const rel = urlPath.replace(/^\/+/, "");
  const filePath = rel ? join(publicDir, rel) : join(publicDir, "index.html");
  const normalized = resolve(filePath);
  if (!normalized.startsWith(resolve(publicDir))) return false;
  if (!existsSync(normalized)) return false;
  const st = await fs.stat(normalized);
  if (!st.isFile()) return false;
  const mime = MIME[extname(normalized)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": mime, "content-length": st.size });
  const stream = (await import("node:fs")).createReadStream(normalized);
  stream.pipe(res);
  return true;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  args: Args,
  publicDir: string | null,
) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/tree") {
    try {
      const tree = await buildTree(args.workspace);
      return json(res, 200, { workspace: args.workspace, tree });
    } catch (err) {
      return json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (url.pathname === "/api/file") {
    const rel = url.searchParams.get("path");
    if (!rel) return json(res, 400, { error: "path required" });
    const abs = safeJoin(args.workspace, rel);
    if (!abs) return json(res, 400, { error: "path escapes workspace" });
    if (!existsSync(abs)) return json(res, 404, { error: "not found" });
    const st = await fs.stat(abs);
    if (!st.isFile()) return json(res, 400, { error: "path is not a file" });
    const { kind, readable } = classifyWorkspaceFile(rel);
    if (!readable) return json(res, 403, { error: `${kind} files are not readable` });
    try {
      if (kind === "channel" || kind === "session" || kind === "jsonl") {
        const result = await readJsonl(abs);
        return json(res, 200, { path: rel, kind, mode: "jsonl", ...result });
      }
      const result = await readText(abs);
      return json(res, 200, { path: rel, kind, mode: "text", ...result });
    } catch (err) {
      return json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!args.apiOnly && publicDir && req.method === "GET") {
    if (await serveStatic(publicDir, url.pathname, res)) return;
    if (await serveStatic(publicDir, "/index.html", res)) return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const publicDir = args.apiOnly
    ? null
    : join(dirname(fileURLToPath(import.meta.url)), "public");

  if (publicDir && !existsSync(publicDir)) {
    console.error(
      `error: public dir not found at ${publicDir} — did you run \`npm run build\`?`,
    );
    process.exit(1);
  }

  const server = createServer((req, res) => {
    handle(req, res, args, publicDir).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("internal error");
      }
    });
  });

  server.listen(args.port, args.host, () => {
    console.log(
      `listening on http://${args.host}:${args.port} (workspace: ${args.workspace})`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
