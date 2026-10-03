import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";

/**
 * The credentials in a home's auth.json, read once when the store is made.
 * Changing them is not supported here: the file is edited by hand.
 */
export function readCredentials(file: string): CredentialStore {
  const entries = new Map<string, Credential>();
  for (const [provider, entry] of readConfig(file)?.entries() ?? []) {
    entries.set(provider, parseCredential(entry));
  }
  const readOnly = (): never => {
    throw new Error(`Credentials can't be changed from here. Edit ${file} instead.`);
  };
  return {
    read: (provider) => Promise.resolve(structuredClone(entries.get(provider))),
    list: () =>
      Promise.resolve([...entries].map(([providerId, { type }]) => ({ providerId, type }))),
    modify: readOnly,
    delete: readOnly,
  };
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
