import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { asError } from "../../lib/errors/index.ts";
import { formatAddress, isLoopback } from "../../lib/link/index.ts";
import type { Certificate } from "../../lib/link/node.ts";
import type { PageSettings } from "../settings/index.ts";

/**
 * Where the page's door listens when its settings say nowhere: this machine's
 * own loopback address, at a port that stays the same from start to start,
 * since an installed page, its cookie and a push subscription all hang on the
 * page's address.
 */
const LOOPBACK = { host: "127.0.0.1", port: 7448 };

/** Where the page's door listens and what it serves with, and the host a browser opens it at. */
export interface PagePlace {
  readonly host: string;
  readonly port: number;
  /** What it serves HTTPS with, or null to serve plain HTTP, which it does only on loopback. */
  readonly certificate: Certificate | null;
  /** The host in the page's address: the certificate's name when it has one, since a browser checks it, and where it listens otherwise. */
  readonly name: string;
}

/**
 * Where the page's door listens, from its settings, which came from `file`:
 * on loopback at 7448 if they say nowhere. A certificate's files
 * are read now. Plain HTTP is refused anywhere but loopback, which is the only
 * place a browser takes it as safe, so that a browser's token never crosses
 * the network in the clear.
 */
export function pagePlace(settings: PageSettings, file: string | undefined): PagePlace {
  const { host, port } = settings.listen ?? LOOPBACK;
  if (settings.certificate === undefined) {
    if (isLoopback(host)) return { host, port, certificate: null, name: host };
    throw new Error(
      `${file ?? "The settings"} has the page's door listen on ${formatAddress({ host, port })} with no certificate. ` +
        "Away from this machine's loopback address it serves only HTTPS, so that a browser's token never crosses the network in the clear: " +
        'set "certificate" and "key" beside "listen", such as the files tailscale cert makes.',
    );
  }
  const cert = readPem(settings.certificate.cert, "certificate");
  const key = readPem(settings.certificate.key, "certificate's key");
  return { host, port, certificate: { cert, key }, name: nameIn(cert, settings.certificate.cert) ?? host };
}

function readPem(path: string, what: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`The page's ${what} can't be read from ${path}: ${asError(error).message}`, { cause: error });
  }
}

/** The first name the certificate in `pem` is for, leaving out a wildcard, which names no one host. */
function nameIn(pem: string, path: string): string | undefined {
  let names: string;
  try {
    names = new X509Certificate(pem).subjectAltName ?? "";
  } catch (error) {
    throw new Error(`The page's certificate in ${path} isn't one a browser could use: ${asError(error).message}`, { cause: error });
  }
  return names
    .split(", ")
    .flatMap((entry) => (entry.startsWith("DNS:") ? [entry.slice("DNS:".length)] : []))
    .find((name) => !name.includes("*"));
}
