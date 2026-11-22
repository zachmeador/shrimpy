import { formatAddress, isPort, parseAddress } from "../../lib/link/index.ts";
import { isFingerprint } from "../../lib/tls/index.ts";
import type { Address } from "./address.ts";

/** What an invitation link says: who is invited, where to go, the code to show there, and the key that proves the gateway. */
export interface Link {
  /** The name of the agent the invitation is for, or null when it is for another machine of the person's own. */
  name: string | null;
  /** The gateway's entry. */
  address: Address;
  /** The invitation's code, as the gateway wrote it. */
  code: string;
  /** The fingerprint of the gateway's key, which the entry proves itself with. */
  fingerprint: string;
}

/**
 * The link for an invitation:
 * `shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q` for an
 * agent, and for a machine of the person's own, which has no name,
 * `shrimpy://100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q`.
 */
export function writeLink({ name, address, code, fingerprint }: Link): string {
  const who = name === null ? "" : `${encodeURIComponent(name)}@`;
  return `shrimpy://${who}${formatAddress(address)}/${encodeURIComponent(code)}/${fingerprint}`;
}

/** An optional name, an address as `formatAddress` writes it, a code and a fingerprint. */
const LINK = /^shrimpy:\/\/(?:([^@/?#]+)@)?([^/?#@]+)\/([^/?#]+)\/([^/?#]+)$/;

/**
 * Read what `writeLink` wrote, as someone pastes it. Text that is not a link
 * is an error that says what a link looks like.
 */
export function readLink(text: string): Link {
  const [, name, written = "", code = "", fingerprint = ""] = LINK.exec(text.trim()) ?? [];
  const address = parseAddress(written);
  const decoded = { name: name === undefined ? null : unescaped(name), code: unescaped(code) };
  if (
    decoded.name === undefined ||
    decoded.code === undefined ||
    address === undefined ||
    !isPort(address.port, 1) ||
    !isFingerprint(fingerprint)
  ) {
    throw new Error(
      `"${text.trim()}" is not an invitation link. A link has the gateway's address, the code and the fingerprint of ` +
        "the gateway's key, and names the agent when it is for an agent, like " +
        "shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q, or like " +
        "shrimpy://100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q for another machine of yours.",
    );
  }
  return { name: decoded.name, address, code: decoded.code, fingerprint };
}

/**
 * The link that lets a browser in: the page's address, as an invitation for a
 * device carries it, with the code after `#`, which a browser keeps to itself,
 * so that no server's log ever has it:
 * `https://shrimpy.example.ts.net:7448/#K7Q2-9FXD`.
 */
export function writePageLink(page: string, code: string): string {
  return `${page}#${encodeURIComponent(code)}`;
}

/** The code a page's link carries, from the `#` of the address the page was opened at, or undefined when it carries none. */
export function readPageCode(fragment: string): string | undefined {
  const code = unescaped(fragment.replace(/^#/, ""))?.trim();
  return code === undefined || code === "" ? undefined : code;
}

/** A piece of a link with its percent-escapes undone, or undefined when they are not valid. */
function unescaped(piece: string): string | undefined {
  try {
    return decodeURIComponent(piece);
  } catch {
    return undefined;
  }
}
