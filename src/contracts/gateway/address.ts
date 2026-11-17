import { int, obj, str } from "@earendil-works/chord";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { isPort } from "../../lib/link/index.ts";

/** Where the gateway's entry is reached over the network. */
export type Address = {
  /** An IP address or a name. An IPv6 address is written without brackets. */
  host: string;
  /** A port from 1 to 65535. Asking the gateway to listen on 0 has it pick one, and it says which. */
  port: number;
};

export const AddressSchema = obj({ host: str(), port: int({ min: 0, max: 65_535 }) });

/**
 * The gateway's entry as a member keeps it once it has joined: its address,
 * and the fingerprint of the key the gateway proves itself with there, which
 * came with the invitation.
 */
export type Entry = Address & { fingerprint: string };

/**
 * The address a file keeps in `object`, with its port from `lowest` to 65535:
 * from 1 for an address to dial, and from 0 for one the gateway listens on,
 * where 0 has it pick a port. Whoever reads anything else of `object` calls
 * its `done` after.
 */
export function readAddress(object: ConfigObject, lowest: 0 | 1): Address {
  const host = object.string("host");
  const port = object.number("port");
  if (!isPort(port, lowest)) throw object.problem("port", `must be a port number from ${String(lowest)} to 65535`);
  return { host, port };
}

/** The gateway's entry as a file keeps it in `object`: its address and the fingerprint of its key. */
export function readEntry(object: ConfigObject): Entry {
  const entry = { ...readAddress(object, 1), fingerprint: object.string("fingerprint") };
  object.done();
  return entry;
}
