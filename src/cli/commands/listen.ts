import { isIPv6 } from "node:net";
import type { Address } from "../../contracts/gateway/index.ts";
import { checkListenAddresses } from "../../gateway/index.ts";
import { UsageError } from "../usage/index.ts";

/** The option that opens the gateway's network entry, for `gateway serve` and `up`. It may be given more than once. */
export const LISTEN_OPTION = { listen: { type: "string", multiple: true } } as const;

/** What the help of a command that takes --listen says about it. */
export const ABOUT_LISTEN =
  "--listen <host:port> opens the gateway's network entry on that address, for agents that live apart from it: " +
  "under another OS user, in a container or on another machine. Give it more than once for more addresses. " +
  "Write an IPv6 address in brackets, as in [::1]:7447. A port of 0 picks a free one. An address that means " +
  "every interface, such as 0.0.0.0 or ::, is refused, because an invitation needs an address that another " +
  "machine can use: name one that only your own machines reach, such as a tailnet address, or 127.0.0.1 for " +
  "another user of this machine. The gateway keeps the addresses in state/listen.json in its data directory, " +
  "and listens there again when it starts with no --listen. Giving --listen replaces them. Deleting the file " +
  "makes the gateway listen on none.";

const HOST_OR_ADDRESS = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** What `--listen` was given as an address, or an error that says what an address looks like. */
function readAddress(text: string): Address {
  const found = /^(?:\[([^\]]*)\]|([^:[\]]*)):(\d+)$/.exec(text);
  const [, bracketed, plain, written] = found ?? [];
  const host = bracketed ?? plain ?? "";
  const port = Number(written);
  const valid = bracketed === undefined ? HOST_OR_ADDRESS.test(host) : isIPv6(host);
  if (found === null || !valid || port > 65_535) {
    throw new UsageError(
      `--listen takes an address as host:port, such as 100.101.102.103:7447, with an IPv6 address in brackets, ` +
        `such as [fd7a:115c:a1e0::1]:7447. "${text}" is not one.`,
    );
  }
  return { host, port };
}

/**
 * The addresses `--listen` was given, or undefined when it was not given. An
 * address that means every interface is refused here, before anything starts.
 */
export function listenAddresses(given: string[] | undefined): Address[] | undefined {
  if (given === undefined || given.length === 0) return undefined;
  const addresses = given.map(readAddress);
  try {
    checkListenAddresses(addresses);
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  return addresses;
}
