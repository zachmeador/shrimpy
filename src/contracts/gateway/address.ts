import { int, obj, str } from "@earendil-works/chord";

/** Where the gateway's entry is reached over the network. */
export type Address = {
  /** An IP address or a name. An IPv6 address is written without brackets. */
  host: string;
  /** A port from 1 to 65535. Asking the gateway to listen on 0 has it pick one, and it says which. */
  port: number;
};

export const AddressSchema = obj({ host: str(), port: int({ min: 0, max: 65_535 }) });

/**
 * An address as it is written in a link or a URL: `100.101.102.103:7447`, and
 * `[fd7a:115c:a1e0::1]:7447` for an IPv6 address, which has colons of its own.
 */
export function formatAddress(address: Address): string {
  const host = address.host.includes(":") ? `[${address.host}]` : address.host;
  return `${host}:${String(address.port)}`;
}

/**
 * The gateway's entry as a member keeps it once it has joined: its address,
 * and the fingerprint of the key the gateway proves itself with there, which
 * came with the invitation.
 */
export type Entry = Address & { fingerprint: string };
