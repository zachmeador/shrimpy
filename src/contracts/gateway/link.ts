import { decodeUri } from "../../lib/uri/index.ts";
import { formatAddress } from "./address.ts";
import type { Address } from "./services.ts";

/** What an invitation link says: who is invited, where to go, and the code to show there. */
export interface Link {
  /** The name of the agent the invitation is for, or null when it is for another machine of the person's own. */
  name: string | null;
  /** The gateway's entry. */
  address: Address;
  /** The invitation's code, as the gateway wrote it. */
  code: string;
}

/**
 * The link for an invitation: `shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD`
 * for an agent, and for a machine of the person's own, which has no name,
 * `shrimpy://100.101.102.103:7447/K7Q2-9FXD`.
 */
export function writeLink({ name, address, code }: Link): string {
  const who = name === null ? "" : `${encodeURIComponent(name)}@`;
  return `shrimpy://${who}${formatAddress(address)}/${encodeURIComponent(code)}`;
}

/** An optional name, a host (an IPv6 address in brackets), a port and a code. */
const LINK = /^shrimpy:\/\/(?:([^@/?#]+)@)?(\[[^\]/?#@]+\]|[^:/?#@[\]]+):(\d{1,5})\/([^/?#]+)$/;
const IPV6 = /^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*$/;

/**
 * Read what `writeLink` wrote, as someone pastes it. Text that is not a link
 * is an error that says what a link looks like.
 */
export function readLink(text: string): Link {
  const [, name, written = "", port = "", code = ""] = LINK.exec(text.trim()) ?? [];
  const bracketed = written.startsWith("[");
  const host = bracketed ? written.slice(1, -1) : written;
  const number = Number(port);
  const decoded = { name: name === undefined ? null : decodeUri(name), code: decodeUri(code) };
  if (
    decoded.name === undefined ||
    decoded.code === undefined ||
    host === "" ||
    (bracketed && !IPV6.test(host)) ||
    !(number >= 1 && number <= 65_535)
  ) {
    throw new Error(
      `"${text.trim()}" is not an invitation link. A link has the gateway's address and the code, and names the agent ` +
        "when it is for an agent, like shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD, or like " +
        "shrimpy://100.101.102.103:7447/K7Q2-9FXD for another machine of yours.",
    );
  }
  return { name: decoded.name, address: { host, port: number }, code: decoded.code };
}
