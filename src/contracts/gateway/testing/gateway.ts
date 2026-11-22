import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { formatAddress } from "../../../lib/link/index.ts";
import type { DialPlace } from "../../../lib/link/node.ts";
import { type ChildProgram, type Restartable, startRestartable, stopAfter, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import type { Address, Client } from "../index.ts";
import { connectClient, gatewaySocket } from "../node.ts";

/** The command that runs Shrimpy, which is how a person starts a program. */
export const SHRIMPY_ENTRY = fileURLToPath(new URL("../../../cli/main.ts", import.meta.url));

/**
 * Write the settings file `file` so that the gateway that reads it opens the
 * page's door on loopback at a port of its own, never at the one a person's
 * gateway has, which tests running at once would also fight over.
 */
export function pagePortOfItsOwn(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ page: { listen: "127.0.0.1:0" } }));
}

export interface TestGatewayOptions {
  /** Addresses for it to open the network entry on, for agents apart from it. A port of 0 picks one. */
  listen?: Address[];
  /** Where it keeps its roster: a directory of its own unless the test gives one. */
  dataDir?: string;
}

/** The line the gateway prints when it begins listening. */
export interface GatewayListening {
  event: string;
  dataDir: string;
  socket: string;
  /** The addresses its network entry listens on, each with the port it got. None unless it was told some or kept some. */
  listen: Address[];
  /** The file it read its addresses from when it was told none, or null. */
  listenKept: string | null;
  /** The fingerprint of its key, which it keeps when it starts again, as an invitation's link carries it. */
  fingerprint: string;
  /** Where a browser opens the web client's page, which the command has the gateway serve, or null when its door couldn't open. */
  page: string | null;
  pid: number;
}

/**
 * The real gateway, which a test takes down and brings back. Frozen, it still
 * takes connections and answers none of them, and the connections it holds
 * stay open; killing it, as `outage` and the test's end do, works all the same.
 */
export interface TestGateway extends Omit<Restartable<GatewayListening>, "recover"> {
  /** Where it keeps its roster. */
  readonly dataDir: string;
  /** The Shrimpy folder the gateway runs in, where `settings.json` lives. */
  readonly folder: string;
  /** Link a client over its socket, as you, or as the holder of `token`. Closed when the test ends. */
  connect(token?: string): Promise<Client>;
  /** Start it again on the same data, like a gateway that came back: where it listened, unless `listen` says where now. */
  recover(listen?: Address[]): Promise<void>;
}

/** A client linked to the gateway at `place`, as you with no token or as the holder of `token`, closed when the test ends. */
export async function connectTestClient(t: TestContext, place: DialPlace, token: string | null = null): Promise<Client> {
  const client = await connectClient({ place, token });
  stopAfter(t, () => client.close());
  return client;
}

const started = new WeakMap<TestContext, Promise<TestGateway>>();

/**
 * The real gateway, started through the command in a process of its own with a
 * Shrimpy folder of its own, listening in the test's runtime directory. Asking
 * again in the same test gives the same gateway, so every helper can ask for
 * the one it needs, and it is the first ask that says where it listens and
 * keeps its data. It is killed when the test ends if it is still running.
 */
export function startTestGateway(t: TestContext, options: TestGatewayOptions = {}): Promise<TestGateway> {
  const existing = started.get(t);
  if (existing !== undefined) return existing;
  const made = start(t, options);
  started.set(t, made);
  return made;
}

async function start(t: TestContext, options: TestGatewayOptions): Promise<TestGateway> {
  useRuntimeDir(t);
  const dataDir = options.dataDir ?? tempDir(t, "gateway-data");
  // A Shrimpy folder of its own, so that settings in a real one, such as a name, never reach the test.
  const folder = join(tempDir(t, "gateway-folder"), "shrimpy");
  pagePortOfItsOwn(join(folder, "settings.json"));
  /** What starts it, told where to listen; told nowhere, it listens where it did. */
  const serve = (listen: Address[]): ChildProgram => ({
    file: SHRIMPY_ENTRY,
    args: ["gateway", "serve", "--data", dataDir, ...listen.flatMap((address) => ["--listen", formatAddress(address)])],
    env: { SHRIMPY_DIR: folder },
  });
  const gateway = await startRestartable<GatewayListening>(t, "The gateway", serve(options.listen ?? []));
  return {
    ...gateway,
    get listening() {
      return gateway.listening;
    },
    dataDir,
    folder,
    connect: (token) => connectTestClient(t, { path: gatewaySocket() }, token ?? null),
    recover: (listen = []) => gateway.recover(() => serve(listen)),
  };
}
