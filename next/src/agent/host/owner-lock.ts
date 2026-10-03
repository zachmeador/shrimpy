import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Lock, takeLock } from "../../lib/lock/index.ts";
import { homePaths } from "../home/index.ts";

/**
 * One owner per home. Take it before opening storage: opening a home's
 * storage rewrites unfinished work, so a second opener corrupts the owner.
 */
export function takeOwnerLock(home: string): Lock {
  const { runtime } = homePaths(home);
  mkdirSync(runtime, { recursive: true });
  return takeLock(join(runtime, "owner.lock"), (cause) => new HomeOwnedError(home, { cause }));
}

export class HomeOwnedError extends Error {
  constructor(home: string, options?: ErrorOptions) {
    super(
      `Another process owns the agent home at ${home}. Talk to that agent instead of opening its storage.`,
      options,
    );
    this.name = "HomeOwnedError";
  }
}
