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
 * The gateway's entry as a member keeps it once it has joined: its address,
 * and the fingerprint of the key the gateway proves itself with there, which
 * came with the invitation.
 */
export type Entry = Address & { fingerprint: string };
