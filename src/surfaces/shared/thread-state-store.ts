import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import { isRecord } from "../../util/record.js";

interface SurfaceThreadState {
  addressedAgentId?: string;
}

interface SurfaceThreadStateData {
  version: 1;
  threads: Record<string, SurfaceThreadState>;
}

export interface SurfaceThreadStateEntry {
  surface: string;
  threadId: string;
  addressedAgentId?: string;
}

function threadKey(surface: string, threadId: string): string {
  return `${surface}:${threadId}`;
}

function parseThreadKey(key: string): { surface: string; threadId: string } {
  const idx = key.indexOf(":");
  if (idx === -1) {
    return { surface: key, threadId: "" };
  }
  return {
    surface: key.slice(0, idx),
    threadId: key.slice(idx + 1),
  };
}

function defaultData(): SurfaceThreadStateData {
  return { version: 1, threads: {} };
}

function parseData(raw: unknown): SurfaceThreadStateData {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.threads)) {
    return { version: 1, threads: {} };
  }
  return {
    version: 1,
    threads: raw.threads as Record<string, SurfaceThreadState>,
  };
}

function loadData(path: string): SurfaceThreadStateData {
  return readJsonFile(path, defaultData, parseData);
}

function saveData(path: string, data: SurfaceThreadStateData): void {
  writeJsonFileAtomic(path, data);
}

export class SurfaceThreadStateStore {
  constructor(private readonly path: string) {}

  list(): SurfaceThreadStateEntry[] {
    const data = loadData(this.path);
    return Object.entries(data.threads)
      .map(([key, state]) => {
        const parsed = parseThreadKey(key);
        return {
          surface: parsed.surface,
          threadId: parsed.threadId,
          addressedAgentId: state.addressedAgentId,
        };
      })
      .sort((a, b) =>
        a.surface.localeCompare(b.surface) || a.threadId.localeCompare(b.threadId)
      );
  }

  get(surface: string, threadId: string): SurfaceThreadState {
    const data = loadData(this.path);
    return { ...(data.threads[threadKey(surface, threadId)] ?? {}) };
  }

  setAddressedAgent(
    surface: string,
    threadId: string,
    addressedAgentId: string,
  ): void {
    const data = loadData(this.path);
    data.threads[threadKey(surface, threadId)] = { addressedAgentId };
    saveData(this.path, data);
  }

  clearAddressedAgent(surface: string, threadId: string): void {
    const data = loadData(this.path);
    const key = threadKey(surface, threadId);
    const existing = data.threads[key];
    if (!existing) return;

    delete existing.addressedAgentId;
    if (Object.keys(existing).length === 0) {
      delete data.threads[key];
    } else {
      data.threads[key] = existing;
    }
    saveData(this.path, data);
  }

  clearAddressedAgentEverywhere(agentId: string): SurfaceThreadStateEntry[] {
    const data = loadData(this.path);
    const cleared: SurfaceThreadStateEntry[] = [];

    for (const [key, state] of Object.entries(data.threads)) {
      if (state.addressedAgentId !== agentId) continue;

      const parsed = parseThreadKey(key);
      cleared.push({
        surface: parsed.surface,
        threadId: parsed.threadId,
        addressedAgentId: state.addressedAgentId,
      });
      delete data.threads[key];
    }

    if (cleared.length > 0) {
      saveData(this.path, data);
    }

    return cleared.sort((a, b) =>
      a.surface.localeCompare(b.surface) || a.threadId.localeCompare(b.threadId)
    );
  }

  renameAddressedAgentEverywhere(
    fromAgentId: string,
    toAgentId: string,
  ): SurfaceThreadStateEntry[] {
    const data = loadData(this.path);
    const updated: SurfaceThreadStateEntry[] = [];

    for (const [key, state] of Object.entries(data.threads)) {
      if (state.addressedAgentId !== fromAgentId) continue;

      const parsed = parseThreadKey(key);
      state.addressedAgentId = toAgentId;
      data.threads[key] = state;
      updated.push({
        surface: parsed.surface,
        threadId: parsed.threadId,
        addressedAgentId: toAgentId,
      });
    }

    if (updated.length > 0) {
      saveData(this.path, data);
    }

    return updated.sort((a, b) =>
      a.surface.localeCompare(b.surface) || a.threadId.localeCompare(b.threadId)
    );
  }
}
