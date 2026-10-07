import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { type ConfigObject, parseConfig } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { type Lock, takeLock } from "../../lib/lock/node.ts";
import { backoff } from "../../lib/retry/index.ts";

/**
 * The longest a change waits for another process to let go of a file. A
 * renewal holds it for the 15 seconds Pi gives a token request at most, and a
 * process that dies lets go at once, so waiting longer means one is stuck.
 */
const LOCK_WAIT_MS = 30_000;

/**
 * The credentials in auth.json files. Every call reads the file again, so what
 * another process changed, such as a renewal, a new sign-in or an edit by
 * hand, is there at the next request with no restart. Nothing changes a file
 * except `modify` and `delete`, which take a lock on it that the operating
 * system holds for the process, so agents that share a file renew a sign-in
 * once. With more than one file, the first that holds an entry for a provider
 * is the one that counts, and the one a change to that entry goes to.
 */
export function credentialStore(file: string, ...fallbacks: readonly string[]): CredentialStore {
  const first = fileStore(file);
  const stores = [first, ...fallbacks.map(fileStore)];
  const holding = async (provider: string, options: AuthOperationOptions | undefined): Promise<CredentialStore> => {
    for (const store of stores) {
      if ((await store.read(provider, options)) !== undefined) return store;
    }
    return first;
  };
  return {
    async read(provider, options) {
      for (const store of stores) {
        const credential = await store.read(provider, options);
        if (credential !== undefined) return credential;
      }
      return undefined;
    },
    async list(options) {
      const listed = new Map<string, CredentialInfo>();
      for (const store of stores) {
        for (const info of await store.list(options)) {
          if (!listed.has(info.providerId)) listed.set(info.providerId, info);
        }
      }
      return [...listed.values()];
    },
    async modify(provider, fn, options) {
      return (await holding(provider, options)).modify(provider, fn, options);
    },
    async delete(provider, options) {
      return (await holding(provider, options)).delete(provider, options);
    },
  };
}

function fileStore(file: string): CredentialStore {
  return {
    async read(provider, options) {
      options?.signal?.throwIfAborted();
      return structuredClone(readEntries(file).get(provider));
    },
    async list(options) {
      options?.signal?.throwIfAborted();
      return [...readEntries(file)].map(([providerId, { type }]) => ({ providerId, type }));
    },
    async modify(provider, fn, options) {
      options?.signal?.throwIfAborted();
      return locked(file, options?.signal, async () => {
        // The file as it is now: another process may have changed it while this one waited.
        const entries = readEntries(file);
        const current = entries.get(provider);
        const next = await fn(structuredClone(current));
        if (next === undefined) return structuredClone(current);
        // Written even if the caller has stopped waiting: a renewed token replaces one the provider has already retired.
        entries.set(provider, next);
        writeEntries(file, entries);
        return structuredClone(next);
      });
    },
    async delete(provider, options) {
      options?.signal?.throwIfAborted();
      if (!existsSync(file)) return;
      await locked(file, options?.signal, () => {
        const entries = readEntries(file);
        if (entries.delete(provider)) writeEntries(file, entries);
      });
    },
  };
}

function readEntries(file: string): Map<string, Credential> {
  return entriesOf(readConfig(file));
}

/** A missing file holds nothing. Any entry that doesn't fit refuses the whole file, naming the entry. */
function entriesOf(root: ConfigObject | undefined): Map<string, Credential> {
  return new Map((root?.entries() ?? []).map(([provider, entry]) => [provider, parseCredential(entry)]));
}

function parseCredential(entry: ConfigObject): Credential {
  const type = entry.choice("type", ["api_key", "oauth"]);
  if (type === "oauth") {
    const access = entry.string("access");
    const refresh = entry.string("refresh");
    const expires = entry.number("expires");
    return { ...entry.rest(), type, access, refresh, expires };
  }
  const key = entry.optionalString("key");
  if (key !== undefined) checkKeyAsWritten(entry, "key", key);
  const env = entry.optionalStrings("env");
  entry.done();
  return { type, ...(key === undefined ? {} : { key }), ...(env === undefined ? {} : { env }) };
}

/**
 * Pi's files can name a command (`!pass show key`) or a variable (`$NAME`) in
 * place of a key. Neither is run or read here, so one would be sent to the
 * provider as if it were the key. Refuse it instead.
 */
export function checkKeyAsWritten(owner: ConfigObject, field: string, key: string): void {
  if (key.startsWith("!") || key.includes("$")) {
    throw owner.problem(
      field,
      "is used exactly as written. Commands (starting with !) and variables (containing $) are not supported, so put the key itself here",
    );
  }
}

/**
 * Write the whole file, every entry as it was apart from the one that changed:
 * to a file of its own first, then renamed over it, so that a reader or a crash
 * sees the old file or the new one and never half of either.
 */
function writeEntries(file: string, entries: ReadonlyMap<string, Credential>): void {
  const text = `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
  // What is written must read back, so a sign-in that came back wrong can't replace a file that works.
  entriesOf(parseConfig(text, file));
  const unfinished = `${file}.tmp`;
  // Only a holder of the lock writes, so anything here is left by one that died.
  rmSync(unfinished, { force: true });
  try {
    const written = openSync(unfinished, "wx", 0o600);
    try {
      writeFileSync(written, text);
      fsyncSync(written);
    } finally {
      closeSync(written);
    }
    renameSync(unfinished, file);
  } catch (error) {
    rmSync(unfinished, { force: true });
    throw error;
  }
}

/** Run `work` while holding the lock on `file`, in a directory that is made private if it is missing. */
async function locked<T>(file: string, signal: AbortSignal | undefined, work: () => T | Promise<T>): Promise<T> {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const lock = await takeWaiting(`${file}.lock`, signal);
  try {
    return await work();
  } finally {
    lock.release();
  }
}

/** Another process holds the lock. */
class HeldElsewhere extends Error {}

/** Take the lock at `path`, waiting for the process that holds it for a while, and no longer once `signal` aborts. */
async function takeWaiting(path: string, signal: AbortSignal | undefined): Promise<Lock> {
  const pauses = backoff({ firstMs: 10, maxMs: 250 });
  const giveUp = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return takeLock(path, (cause) => new HeldElsewhere("The lock is held by another process.", { cause }));
    } catch (error) {
      if (!(error instanceof HeldElsewhere)) throw error;
      if (Date.now() >= giveUp) {
        throw new Error(
          `Another process has held ${path} for ${LOCK_WAIT_MS / 1000} seconds, so waiting to change the credentials stopped. ` +
            "It may be stuck on a request to a provider.",
          { cause: error },
        );
      }
    }
    await sleep(pauses.next(), undefined, { signal });
  }
}
