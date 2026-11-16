import { type Address, formatAddress } from "../../contracts/gateway/index.ts";

/** Why the gateway could not listen on `address`: which address, and the reason in plain words. */
export function cannotListen(address: Address, cause: unknown): Error {
  const { code, message } = cause as NodeJS.ErrnoException;
  const why =
    code === "EADDRINUSE"
      ? "another program is using that port"
      : code === "EADDRNOTAVAIL"
        ? "this machine has no such address"
        : code === "EACCES"
          ? "this user may not listen on that port"
          : message;
  return new Error(`The gateway can't listen on ${formatAddress(address)}: ${why}.`, { cause });
}
