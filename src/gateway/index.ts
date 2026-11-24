/**
 * The gateway program: one process per network that keeps the roster of who
 * is on it and is Chord's relay between everyone else. Clients link in on its
 * own socket or its entry, each stamped with who it is from its way in; every
 * program links out to it, and its link is the route by which the gateway
 * relays requests for it, stamped with who asks. It serves `Roster`, makes
 * invitations, and takes tokens back. Over its entry it proves itself with a
 * key it keeps in its data directory, whose fingerprint every invitation's
 * link carries. It keeps the addresses it listens on, so that a start with
 * none listens where the last one did, and follows your settings file for your
 * name. It hosts the workspace context, the Markdown files of `context/` in
 * the Shrimpy folder, for every agent to hold, and follows them as they change. Given the web client's page, it serves it at a door of its own for
 * browsers, where your settings say, and lets a browser in there as a device
 * of yours, which may say where it is told things. What the chat server hands
 * it to tell you, it sends to each such device by Web Push, signed with a
 * second key it keeps. It never holds an agent's home, its work or a
 * conversation, and never reads what it relays. Other programs reach it
 * through `contracts/gateway`; they never import this program's modules, and
 * it never imports the web client.
 */
import { rmSync } from "node:fs";
import { userInfo } from "node:os";
import { createHost, type HostError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type Address, gateway, type PageFile, type Principal, type Revocation, revokedBy } from "../contracts/gateway/index.ts";
import {
  checkListenAddresses,
  gatewaySocket,
  keepListenAddresses,
  keptListenAddresses,
  listenAddressesFile,
} from "../contracts/gateway/node.ts";
import { opening } from "../lib/closing/index.ts";
import { asError } from "../lib/errors/index.ts";
import { hostFailure } from "../lib/link/index.ts";
import { type Listener, listen } from "../lib/link/node.ts";
import { greeter } from "./hello/index.ts";
import { createInvitations } from "./invitations/index.ts";
import { openKey, openPushKey } from "./key/index.ts";
import { cannotListen } from "./listening/index.ts";
import { takeDataLock, takeGatewayLock } from "./lock.ts";
import { openPage } from "./page/index.ts";
import { createPrograms } from "./programs/index.ts";
import { createPush, publicKeyOf } from "./push/index.ts";
import { openRoster, type Roster } from "./roster/index.ts";
import { createActions, createView, gatewayFacet } from "./served/index.ts";
import { followSettings } from "./settings/index.ts";
import { hostWorkspace, type Workspace } from "./workspace/index.ts";

export { GatewayRunningError } from "./lock.ts";

export interface GatewayOptions {
  /** Where the gateway keeps the roster and its key. It is made if it is missing, and the key with it. */
  dataDir: string;
  /**
   * The addresses to open the entry on, for whoever is apart from the gateway:
   * an agent under another user, in a container or on another machine, and
   * your devices. A port of 0 picks one. Given, they replace the addresses the
   * gateway kept in its data directory, once it is listening on them. Without
   * any, it listens where it did at its last start, if it kept addresses there,
   * and otherwise only on its own socket, and makes no invitations, since
   * nobody could use one. An address that means every interface is refused,
   * since an invitation needs one that another machine can use.
   */
  listen?: Address[];
  /**
   * The OS account the gateway runs as, which names you when it first makes
   * its data. This process's account unless a test gives another.
   */
  account?: string;
  /**
   * Your settings file, which the gateway reads when it starts and again
   * whenever it changes: your name is set there. While there is no file, your
   * name stays as it is. Where the page's door listens, and the certificate
   * it serves with, are read from it when the gateway starts.
   */
  settings?: string;
  /**
   * The Shrimpy folder's `context/`, whose Markdown files the gateway hosts as
   * the workspace context: read when it starts, and again whenever they
   * change. Without it, the workspace context has no files.
   */
  context?: string;
  /**
   * The web client's page, as a browser is served it: the file at "/" and
   * every file it asks for. Given, the gateway opens the page's door, where
   * your settings say, and otherwise on this machine's loopback address at
   * 7448. A door that can't open stays shut, and the gateway says why and
   * goes on.
   */
  page?: readonly PageFile[];
}

export interface RunningGateway {
  /** The gateway's own socket. */
  readonly socket: string;
  /** The addresses the entry listens on, each with the port it got. None when it is not open. */
  readonly listening: Address[];
  /** The file the addresses were read from, when this start was given none and listens where an earlier one did. */
  readonly listeningAsKept: string | undefined;
  /** The fingerprint of the gateway's key, which every invitation's link carries and a member checks the entry against. */
  readonly fingerprint: string;
  /** Where a browser opens the page, which an invitation for a device carries, or undefined when the gateway serves none or its door couldn't open. */
  readonly page: string | undefined;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

/**
 * Start the gateway on its own socket, and on its entry if it has addresses.
 * Fails if a gateway is already running on the socket or using the data
 * directory; the socket's lock comes first, so a refused gateway touches
 * neither. You are on the roster before anything links, made with its data
 * and named for the account the gateway runs as then, and given the name your
 * settings set, so no agent can take your name first. The gateway's keys are
 * made then too, or at the first start whose data has none: every connection
 * on the entry is TLS around one, and notifications are signed with the
 * other. An address of the entry's that
 * can't be listened on stops the start. The page's door never stops it: one
 * that can't open stays shut, and the gateway says why.
 */
export async function startGateway(options: GatewayOptions): Promise<RunningGateway> {
  const given = options.listen === undefined || options.listen.length === 0 ? undefined : options.listen;
  if (given !== undefined) checkListenAddresses(given);
  const socket = gatewaySocket();
  const lock = takeGatewayLock(socket);
  const open = opening("The gateway did not close cleanly");
  open.add(() => lock.release());

  try {
    const data = takeDataLock(options.dataDir);
    open.add(() => data.release());
    const roster = openRoster(options.dataDir, options.account ?? userInfo().username);
    // Made or read once the data directory is held, so that no other gateway makes one at the same time.
    const { key, fingerprint } = openKey(options.dataDir);
    const pushKey = openPushKey(options.dataDir);
    if (options.settings !== undefined) open.add(followYourName(roster, options.settings));
    // What was kept is read once the data directory is held, so that no other gateway is changing it, and before anything listens.
    const kept = given === undefined ? keptListenAddresses(options.dataDir) : [];
    const wanted = given ?? (kept.length > 0 ? kept : undefined);
    const listeningAsKept = given === undefined && kept.length > 0 ? listenAddressesFile(options.dataDir) : undefined;
    const invitations = createInvitations();

    const host = createHost<Principal, Revocation>({
      address: gateway(),
      principal: { kind: "gateway" },
      revokedBy,
      onError: (error) => report(error),
    });
    open.add(() => host.close(context));
    const programs = createPrograms({
      host,
      agents: () => roster.members().filter((member) => member.kind === "agent"),
      onChange: () => view.changed(),
      context,
    });
    open.add(() => programs.close());
    const report = (error: HostError): void => {
      if (error.kind === "resolve_failed" && programs.notLinked(error.error)) return;
      console.error(hostFailure(error).message);
    };
    const onError = (error: unknown): void => console.error(asError(error).message);
    let workspace: Workspace | undefined;
    const workspaceView = createView(() => workspace?.files() ?? []);
    if (options.context !== undefined) {
      const hosted = await hostWorkspace(options.context, { onChange: () => workspaceView.changed(), onError });
      open.add(() => hosted.close());
      workspace = hosted;
    }
    const view = createView(() => ({
      id: roster.id,
      members: roster.members().map((member) => ({ ...member, reachable: programs.reachable(member.id) })),
      programs: programs.list(),
      turnedAway: programs.turnedAway(),
      ways: roster.ways(),
    }));
    const entries: Listener[] = [];
    let page: string | undefined;
    const push = createPush({
      places: () => roster.webPushPlaces(),
      forget: (way, endpoint) => roster.forgetWebPush(way, endpoint),
      key: pushKey,
      // Push services are told the page's address as whom to contact, when it is one they take.
      contact: () => (page?.startsWith("https:") === true ? page : undefined),
      onError,
    });
    const actions = createActions({
      roster,
      invitations,
      programs,
      push,
      host,
      addresses: () => entries.map(({ place }) => place as Address),
      page: () => page,
      fingerprint,
      context,
    });
    await host.load([{ name: "@shrimpy/gateway", facet: gatewayFacet(view, workspaceView, actions) }], context);
    programs.start();
    roster.onChange(() => {
      programs.followRoster();
      view.changed();
    });

    const { greet, greetPage, letBrowserIn } = greeter({ roster, programs, invitations, host, context });
    // The lock is held, so a socket left at the path belongs to a gateway that is gone.
    rmSync(socket, { force: true });
    const own = await listen({ path: socket }, greet("socket"), { onError });
    open.add(() => own.close());
    if (wanted !== undefined) {
      try {
        // A file edited by hand may name an address that is refused.
        checkListenAddresses(wanted);
        for (const address of wanted) {
          const entry = await listen({ ...address, key }, greet("entry"), { onError }).catch((error: unknown) => {
            throw cannotListen(address, error);
          });
          open.add(() => entry.close());
          entries.push(entry);
        }
      } catch (error) {
        if (listeningAsKept === undefined) throw error;
        throw new Error(
          `${asError(error).message} The gateway took the address from ${listeningAsKept}, where it kept what it listened on last time. ` +
            "Start it with other addresses to replace what is kept, or delete that file to listen on none.",
          { cause: error },
        );
      }
    }
    if (options.page !== undefined) {
      try {
        const door = await openPage({
          files: options.page,
          settings: options.settings,
          // Named for the roster, since a browser sends a cookie to every port of a host, and two gateways may share one.
          cookie: `shrimpy-${roster.id}`,
          greet: greetPage,
          join: letBrowserIn,
          pushKey: publicKeyOf(pushKey),
          keepPush: (kept, { endpoint, keys }) => roster.keepWebPush(kept, { endpoint, p256dh: keys.p256dh, auth: keys.auth }),
          onError,
        });
        open.add(() => door.close());
        page = door.url;
      } catch (error) {
        // The rest of the gateway goes on without the page's door.
        onError(error);
      }
    }
    const listening = entries.map(({ place }) => place as Address);
    // Only addresses that were listened on replace what was kept.
    if (given !== undefined) keepListenAddresses(options.dataDir, listening);
    return { socket, listening, listeningAsKept, fingerprint, page, close: () => open.closeAll() };
  } catch (error) {
    await open.closeAll().catch(() => undefined);
    throw error;
  }
}

/**
 * Give you the name the settings in `file` set, now and each time the file
 * changes. A name another member has, or a file that can't be used, leaves
 * your name as it is, and the gateway says why where it reports problems.
 */
function followYourName(roster: Roster, file: string): () => void {
  const stays = (): string => `Your name stays "${roster.you().name}"`;
  return followSettings(
    file,
    ({ name }) => {
      if (name === undefined) return;
      const renamed = roster.rename(roster.you().id, name);
      if (renamed.kind === "refused") console.error(`${stays()}: the name in ${file} can't be used. ${renamed.words}`);
    },
    (error) => console.error(`${stays()}: ${error.message}`),
  );
}
