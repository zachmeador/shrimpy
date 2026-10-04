import { createHash } from "node:crypto";
import { join } from "node:path";
import { namedSocketPath, runtimeDir } from "../../lib/runtime/node.ts";
import type { ProgramName } from "./services.ts";

/** The folder of the runtime directory that holds the gateway's ways in. */
const WAYS_FOLDER = "ways";

/** Where the gateway keeps a way in for each program that is registered. */
export function waysDirectory(): string {
  return join(runtimeDir(), WAYS_FOLDER);
}

/**
 * The Unix socket the gateway listens on for connections to the program called
 * `target`, which it pipes to the program's own socket. The name is worked out
 * from the program's kind and name alone, so a client needs to be told nothing,
 * and it is a hash of them so that its path stays short whatever the name is:
 * a socket path holds 104 bytes. The gateway makes it when the program
 * registers and takes it away when the program is gone.
 */
export function wayInSocket(target: ProgramName): string {
  const name = createHash("sha256").update(`${target.kind}\0${target.name}`).digest("hex").slice(0, 16);
  return namedSocketPath(`${WAYS_FOLDER}/${name}`);
}
