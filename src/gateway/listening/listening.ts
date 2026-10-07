import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { BlockList, isIP } from "node:net";
import { dirname, join } from "node:path";
import { type Address, formatAddress } from "../../contracts/gateway/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";

/** Where the gateway keeps the addresses it listens on, inside its data directory. */
export const listeningFile = (dataDir: string): string => join(dataDir, "state", "listen.json");

/** The addresses the gateway of `dataDir` kept when it last listened, or none. A file that can't be used is an error naming it. */
export function readKept(dataDir: string): Address[] {
  const root = readConfig(listeningFile(dataDir));
  if (root === undefined) return [];
  const addresses = root.objects("addresses").map((entry) => {
    const host = entry.string("host");
    const port = entry.number("port");
    entry.done();
    if (!Number.isInteger(port) || port > 65_535) throw entry.problem("port", "must be a port number from 0 to 65535");
    return { host, port };
  });
  root.done();
  return addresses;
}

/** Keep `addresses` in place of what was kept, whole or not at all. */
export function keep(dataDir: string, addresses: readonly Address[]): void {
  const file = listeningFile(dataDir);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const unfinished = `${file}.${String(process.pid)}`;
  writeFileSync(unfinished, `${JSON.stringify({ addresses }, null, 2)}\n`, { mode: 0o600 });
  renameSync(unfinished, file);
}

const EVERY_INTERFACE = new BlockList();
EVERY_INTERFACE.addAddress("0.0.0.0", "ipv4");
EVERY_INTERFACE.addAddress("::", "ipv6");

/** Whether `host` is the address that listens on every interface, in either family and however it is written. A listener with no host is one too. */
function meansEveryInterface(host: string): boolean {
  if (host.trim() === "") return true;
  const family = isIP(host);
  return family !== 0 && EVERY_INTERFACE.check(host, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Refuse an address that listens on every interface, such as `0.0.0.0` and `::`.
 * An invitation names the address the gateway listens on, and one that means
 * every interface is one that no other machine can use.
 */
export function checkListenAddresses(addresses: readonly Address[]): void {
  for (const address of addresses) {
    if (!meansEveryInterface(address.host)) continue;
    throw new Error(
      `${formatAddress(address)} means every interface, and an invitation needs an address that another machine can use. ` +
        "Give the address that the agent's machine reaches this one at, such as its tailnet address, " +
        "or 127.0.0.1 for another user of this machine.",
    );
  }
}
