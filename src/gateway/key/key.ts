import { createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { asError } from "../../lib/errors/index.ts";
import { codeOf } from "../../lib/files/index.ts";
import { saveFile } from "../../lib/files/node.ts";
import { fingerprintOf, newKey } from "../../lib/tls/node.ts";

/** Where the gateway keeps its key, inside its data directory. */
const keyFile = (dataDir: string): string => join(dataDir, "state", "key.pem");

/** Where the gateway keeps the key it signs notifications with, beside its other key. */
const pushKeyFile = (dataDir: string): string => join(dataDir, "state", "push-key.pem");

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
  const key = readKey(file, "the gateway's key", "every member that joined from apart checks the gateway by it, and would refuse a new one");
  if (key === undefined) {
    const made = newKey();
    save(file, made);
    return { key: made, fingerprint: fingerprintOf(made) };
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw cannotUse(
      file,
      "the gateway's key",
      `it holds a key of the type ${String(key.asymmetricKeyType)}, and the gateway's is Ed25519`,
      "every member that joined from apart checks the gateway by it, and would refuse a new one",
    );
  }
  return { key, fingerprint: fingerprintOf(key) };
}

/**
 * The key the gateway of `dataDir` signs its notifications with, for the push
 * services of your devices: a P-256 key, made and kept first when the
 * directory has none. A file that is there and can't be used stops the
 * gateway, since every device was set up to be told things with that key, and
 * would hear nothing signed with a new one.
 */
export function openPushKey(dataDir: string): KeyObject {
  const file = pushKeyFile(dataDir);
  const why = "every device of yours that is told things was set up with it, and would hear nothing signed with a new one";
  const key = readKey(file, "the key the gateway signs notifications with", why);
  if (key === undefined) {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    save(file, privateKey);
    return privateKey;
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw cannotUse(file, "the key the gateway signs notifications with", "it holds a key that isn't on P-256", why);
  }
  return key;
}

/** The private key in `file`, or undefined when there is no file. One that can't be read or holds no private key stops the gateway. */
function readKey(file: string, what: string, why: string): KeyObject | undefined {
  let pem: string;
  try {
    pem = readFileSync(file, "utf8");
  } catch (error) {
    if (codeOf(error) === "ENOENT") return undefined;
    throw cannotUse(file, what, asError(error).message, why, error);
  }
  try {
    return createPrivateKey(pem);
  } catch (error) {
    throw cannotUse(file, what, "it holds no private key", why, error);
  }
}

function cannotUse(file: string, what: string, problem: string, why: string, cause?: unknown): Error {
  return new Error(`${file} can't be used as ${what}: ${problem}. Put back the key the gateway made: ${why}.`, { cause });
}

/** Keep `key` in `file`, saved whole, since half a key would stop the gateway, and readable only by the gateway's account. */
function save(file: string, key: KeyObject): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  saveFile(file, key.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
}
