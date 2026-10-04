import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import type { ChangeEvent } from "../shared/types.js";
import {
  normalizeRelativePath,
  resolveAgents,
} from "./workspace.js";

type Listener = (event: ChangeEvent) => void;

export class WorkspaceWatcher {
  private readonly listeners = new Set<Listener>();
  private readonly watchers = new Map<string, FSWatcher>();
  private revision = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: Map<string, string> | undefined;
  private running = false;

  constructor(private readonly workspace: string) {}

  async start(): Promise<void> {
    this.running = true;
    await this.reconcile();
    this.timer = setInterval(() => {
      void this.reconcile();
    }, 5_000);
    this.timer.unref();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.timer = undefined;
    this.flushTimer = undefined;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  currentRevision(): string {
    return String(this.revision);
  }

  async reconcileNow(): Promise<void> {
    await this.reconcile();
  }

  private queue(path: string): void {
    if (!this.isActive()) return;
    this.pending.add(normalizeRelativePath(path) || ".");
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      const paths = [...this.pending].sort();
      this.pending.clear();
      const event = { revision: String(++this.revision), paths };
      for (const listener of this.listeners) listener(event);
      if (this.running) void this.reconcile();
    }, 60);
  }

  private async reconcile(): Promise<void> {
    if (!this.running) return;
    const roots = new Set([
      this.workspace,
      ...resolveAgents(this.workspace).map((agent) => agent.root),
    ]);
    const discovery = await discover([...roots]);
    if (!this.isActive()) return;
    if (this.snapshot) {
      for (const [path, revision] of discovery.snapshot) {
        if (this.snapshot.get(path) !== revision) this.queue(displayPath(path, this.workspace));
      }
      for (const path of this.snapshot.keys()) {
        if (!discovery.snapshot.has(path)) this.queue(displayPath(path, this.workspace));
      }
    }
    this.snapshot = discovery.snapshot;
    const directories = discovery.directories;
    for (const directory of directories) {
      if (this.watchers.has(directory)) continue;
      try {
        const watcher = watch(directory, (event, name) => {
          const path = name
            ? join(relative(this.workspace, directory), String(name))
            : relative(this.workspace, directory);
          this.queue(path);
        });
        watcher.on("error", () => {
          watcher.close();
          this.watchers.delete(directory);
        });
        this.watchers.set(directory, watcher);
      } catch {
        // The periodic reconciliation retries directories that race with writes.
      }
    }
    for (const [directory, watcher] of this.watchers) {
      if (directories.has(directory)) continue;
      watcher.close();
      this.watchers.delete(directory);
    }
  }

  private isActive(): boolean {
    return this.running;
  }
}

async function discover(roots: string[]): Promise<{
  directories: Set<string>;
  snapshot: Map<string, string>;
}> {
  const directories = new Set<string>();
  const snapshot = new Map<string, string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    directories.add(directory);
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        pending.push(join(directory, entry.name));
      } else if (entry.isFile()) {
        const path = join(directory, entry.name);
        try {
          const stat = await fs.stat(path);
          snapshot.set(path, `${Math.trunc(stat.mtimeMs)}:${stat.size}`);
        } catch {
          // Atomic replacements can disappear between enumeration and stat.
        }
      }
    }
  }
  return { directories, snapshot };
}

function displayPath(path: string, workspace: string): string {
  const value = normalizeRelativePath(relative(workspace, path));
  return value.startsWith("../") ? `@external/${path}` : value;
}
