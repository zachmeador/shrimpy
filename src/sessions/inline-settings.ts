import { SettingsManager } from "@earendil-works/pi-coding-agent";

type SettingsScope = "global" | "project";

class SeededInMemoryStorage {
  private global: string | undefined;
  private project: string | undefined;

  constructor(globalSeed: unknown) {
    this.global = JSON.stringify(globalSeed ?? {});
  }

  withLock(
    scope: SettingsScope,
    fn: (current: string | undefined) => string | undefined,
  ): void {
    const current = scope === "global" ? this.global : this.project;
    const next = fn(current);
    if (next === undefined) return;
    if (scope === "global") this.global = next;
    else this.project = next;
  }
}

export function createInlineSettingsManager(
  globalSettings: Record<string, unknown>,
): SettingsManager {
  return SettingsManager.fromStorage(
    new SeededInMemoryStorage(globalSettings) as unknown as Parameters<
      typeof SettingsManager.fromStorage
    >[0],
  );
}
