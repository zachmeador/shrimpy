import { createPrivateKey, type KeyObject } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fingerprintOf, newKey } from "../../lib/tls/node.ts";

/** Where the gateway keeps its key, inside its data directory. */
const keyFile = (dataDir: string): string => join(dataDir, "state", "key.pem");

/** The gateway's key, with what an invitation's link carries of it. */
export interface GatewayKey {
  /** The private key, which the entry serves a certificate around. */
  readonly key: KeyObject;
  /** The key's fingerprint, which a member keeps from its invitation and checks the entry against. */
  readonly fingerprint: string;
}

/**
 * The key the gateway of `dataDir` proves itself with, made and kept first
 * when the directory has none. A file that is there and can't be used stops
 * the gateway, since a new key would be refused by every member that joined
 * from apart.
 */
export function openKey(dataDir: string): GatewayKey {
  const file = keyFile(dataDir);
  let pem: string;
  try {
    pem = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw cannotUse(file, (error as Error).message, error);
    const key = newKey();
    save(file, key);
    return { key, fingerprint: fingerprintOf(key) };
  }
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch (error) {
    throw cannotUse(file, "it holds no private key", error);
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw cannotUse(file, `it holds a key of the type ${String(key.asymmetricKeyType)}, and the gateway's is Ed25519`);
  }
  return { key, fingerprint: fingerprintOf(key) };
}

function cannotUse(file: string, why: string, cause?: unknown): Error {
  return new Error(
    `${file} can't be used as the gateway's key: ${why}. Put back the key the gateway made: every member that joined ` +
      "from apart checks the gateway by it, and would refuse a new one.",
    { cause },
  );
}

/**
 * Keep `key` in `file`, whole or not at all, readable only by the gateway's
 * account. It is flushed before it takes its place, so a power cut leaves no
 * half of a key, which would stop the gateway.
 */
function save(file: string, key: KeyObject): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const unfinished = `${file}.${String(process.pid)}`;
  const descriptor = openSync(unfinished, "w", 0o600);
  try {
    writeSync(descriptor, key.export({ type: "pkcs8", format: "pem" }));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(unfinished, file);
}
