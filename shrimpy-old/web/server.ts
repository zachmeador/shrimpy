#!/usr/bin/env node
import {
  createReadStream,
  existsSync,
  promises as fs,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { TreeResponse } from "./shared/types.js";
import { NodeReadError, readNode } from "./server/nodes.js";
import { buildTree } from "./server/tree.js";
import { resolveWorkspacePath } from "./server/workspace.js";
import { WorkspaceWatcher } from "./server/watcher.js";

export interface WebServerArgs {
  port: number;
  host: string;
  workspace: string;
  apiOnly: boolean;
}

export interface RunningWebServer {
  server: Server;
  watcher: WorkspaceWatcher;
  close(): Promise<void>;
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

export function parseArgs(argv: string[]): WebServerArgs {
  let port = 5174;
  let host = "127.0.0.1";
  let workspaceOverride: string | undefined;
  let apiOnly = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--port") port = Number(argv[++index]);
    else if (argument?.startsWith("--port=")) port = Number(argument.slice(7));
    else if (argument === "--host") host = String(argv[++index]);
    else if (argument?.startsWith("--host=")) host = argument.slice(7);
    else if (argument === "--workspace") workspaceOverride = String(argv[++index]);
    else if (argument?.startsWith("--workspace=")) {
      workspaceOverride = argument.slice(12);
    } else if (argument === "--api-only") apiOnly = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid port: ${port}`);
  }
  if (!host.trim()) throw new Error("host must not be empty");
  return {
    port,
    host,
    workspace: resolveWorkspacePath(workspaceOverride),
    apiOnly,
  };
}

export async function startWebServer(
  args: WebServerArgs,
  opts: { publicDir?: string | null } = {},
): Promise<RunningWebServer> {
  const defaultPublicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
  const publicDir = opts.publicDir === undefined
    ? (args.apiOnly ? null : defaultPublicDir)
    : opts.publicDir;
  if (publicDir && !existsSync(publicDir)) {
    throw new Error(
      `public dir not found at ${publicDir} — did you run \`npm run build\`?`,
    );
  }
  const watcher = new WorkspaceWatcher(args.workspace);
  await watcher.start();
  const connections = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    handle(request, response, args, publicDir, watcher, connections).catch(
      (error: unknown) => {
        console.error(error);
        if (!response.headersSent) {
          json(response, 500, { error: "internal error" });
        } else {
          response.end();
        }
      },
    );
  });
  try {
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(args.port, args.host, () => {
        server.off("error", reject);
        resolveListen();
      });
    });
  } catch (error) {
    watcher.stop();
    throw error;
  }
  return {
    server,
    watcher,
    async close() {
      watcher.stop();
      for (const response of connections) response.end();
      const closed = new Promise<void>((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
      server.closeAllConnections();
      await closed;
    },
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  args: WebServerArgs,
  publicDir: string | null,
  watcher: WorkspaceWatcher,
  connections: Set<ServerResponse>,
): Promise<void> {
  applySecurityHeaders(response);
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    json(response, 405, { error: "method not allowed" });
    return;
  }
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "127.0.0.1"}`,
  );

  if (url.pathname === "/api/tree") {
    try {
      const tree = await buildTree(args.workspace);
      json(response, 200, {
        workspace: args.workspace,
        revision: watcher.currentRevision(),
        tree,
      } satisfies TreeResponse);
    } catch (error) {
      json(response, 500, { error: errorMessage(error) });
    }
    return;
  }

  if (url.pathname === "/api/node") {
    const id = url.searchParams.get("id");
    if (!id) {
      json(response, 400, { error: "id required" });
      return;
    }
    const cursorValue = url.searchParams.get("cursor");
    const anchor = url.searchParams.get("anchor") ?? undefined;
    const cursor = cursorValue === null ? undefined : Number(cursorValue);
    if (cursorValue !== null && (!Number.isSafeInteger(cursor) || cursor! < 0)) {
      json(response, 400, { error: "cursor must be a non-negative integer" });
      return;
    }
    try {
      json(response, 200, await readNode(args.workspace, id, cursor, anchor));
    } catch (error) {
      const status = error instanceof NodeReadError ? error.status : 500;
      json(response, status, { error: errorMessage(error) });
    }
    return;
  }

  if (url.pathname === "/api/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.write(`event: ready\ndata: {"revision":"${watcher.currentRevision()}"}\n\n`);
    connections.add(response);
    const unsubscribe = watcher.subscribe((event) => {
      response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const keepalive = setInterval(() => response.write(": keepalive\n\n"), 15_000);
    keepalive.unref();
    request.on("close", () => {
      clearInterval(keepalive);
      unsubscribe();
      connections.delete(response);
    });
    return;
  }

  if (!args.apiOnly && publicDir) {
    if (await serveStatic(publicDir, url.pathname, response)) return;
    if (await serveStatic(publicDir, "/index.html", response)) return;
  }
  json(response, 404, { error: "not found" });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  response.end(data);
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
  );
}

async function serveStatic(
  publicDir: string,
  urlPath: string,
  response: ServerResponse,
): Promise<boolean> {
  const root = resolve(publicDir);
  const relativePath = decodeURIComponent(urlPath).replace(/^\/+/, "") || "index.html";
  const path = resolve(root, relativePath);
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === "..") return false;
  let stat;
  try {
    stat = await fs.stat(path);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  response.writeHead(200, {
    "content-type": MIME[extname(path)] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": relativePath === "index.html"
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  createReadStream(path).pipe(response);
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    console.log(
      "shrimpy-web [--port=5174] [--host=127.0.0.1] [--workspace=/path] [--api-only]",
    );
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const running = await startWebServer(args);
  console.log(
    `[web] listening on http://${args.host}:${args.port} (workspace: ${args.workspace})`,
  );
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    void running.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(`[web] ${errorMessage(error)}`);
    process.exit(1);
  });
}
