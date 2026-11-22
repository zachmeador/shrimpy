import { unwatchFile, watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Address } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import type { ConfigObject } from "../../lib/json-config/index.ts";
import { readConfig } from "../../lib/json-config/node.ts";
import { isPort, parseAddress } from "../../lib/link/index.ts";

/** Where the page's door listens and what it serves with, as the file has them. A setting the file leaves out takes its default. */
export interface PageSettings {
  /** The address the door listens on. A port of 0 picks one. */
  readonly listen?: Address;
  /** The certificate a browser trusts and its private key, as the paths of their files, from the folder the settings file is in. */
  readonly certificate?: { readonly cert: string; readonly key: string };
}

/** Your settings, as the file has them. A setting the file leaves out stays as it is. */
export interface Settings {
  /** Your name, as every member sees it. */
  readonly name?: string;
  /** The page's door, which the gateway reads when it starts. */
  readonly page?: PageSettings;
}

/** How often the file is looked at for a change. */
const LOOK_MS = 1000;

/** The settings in `file`, or undefined when there is no file. A file that can't be used is an error that says what to fix. */
export function readSettings(file: string): Settings | undefined {
  const root = readConfig(file);
  if (root === undefined) return undefined;
  const name = root.optionalString("name");
  const pageObject = root.optionalObject("page");
  const page = pageObject === undefined ? undefined : readPage(pageObject, dirname(file));
  root.done();
  return { ...(name === undefined ? {} : { name }), ...(page === undefined ? {} : { page }) };
}

function readPage(object: ConfigObject, folder: string): PageSettings {
  const written = object.optionalString("listen");
  const listen = written === undefined ? undefined : parseAddress(written);
  if (written !== undefined && (listen === undefined || !isPort(listen.port, 0))) {
    throw object.problem("listen", "must be an address and a port, like 127.0.0.1:7448 or [::1]:7448");
  }
  const cert = object.optionalString("certificate");
  const key = object.optionalString("key");
  if ((cert === undefined) !== (key === undefined)) {
    throw object.problem(cert === undefined ? "certificate" : "key", "goes with the other: the certificate's file and its key's file are given together");
  }
  object.done();
  const certificate = cert === undefined || key === undefined ? undefined : { cert: resolve(folder, cert), key: resolve(folder, key) };
  return { ...(listen === undefined ? {} : { listen }), ...(certificate === undefined ? {} : { certificate }) };
}

/**
 * Read the settings in `file` now, and again each time the file changes, and
 * hand each reading to `apply`, or why the file can't be used to `onError`. A
 * file that isn't there, or is taken away, sets nothing. Returns what stops
 * following it.
 */
export function followSettings(file: string, apply: (settings: Settings) => void, onError: (error: Error) => void): () => void {
  const read = (): void => {
    let settings: Settings | undefined;
    try {
      settings = readSettings(file);
    } catch (error) {
      onError(asError(error));
      return;
    }
    if (settings !== undefined) apply(settings);
  };
  // The file is looked at rather than watched, since a folder shared from another machine tells nothing of a change made there.
  watchFile(file, { interval: LOOK_MS, persistent: false }, read);
  read();
  return () => unwatchFile(file, read);
}
