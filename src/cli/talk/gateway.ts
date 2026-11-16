import { contextOf, type Member, type Program, Roster, type RosterEntry } from "../../contracts/gateway/index.ts";
import { type Client, connectClient, gatewaySocket, HelloRefusedError, UnprovenGatewayError } from "../../contracts/gateway/node.ts";
import { asError } from "../../lib/errors/index.ts";
import { formatAddress } from "../../lib/link/index.ts";
import { type DialPlace, nobodyThere } from "../../lib/link/node.ts";
import { START_EVERYTHING } from "./hints.ts";
import { type Me, me } from "./me.ts";

/** Nothing is listening for the gateway on this machine. */
export class GatewayNotRunningError extends Error {
  constructor(options?: ErrorOptions) {
    super("No gateway is running on this machine.", options);
    this.name = "GatewayNotRunningError";
  }
}

/** What the gateway says is linked and who is on its roster. */
export interface GatewayView {
  /** Every program linked to it, oldest first. */
  programs: Program[];
  /** Everyone on the roster, oldest first. */
  members: RosterEntry[];
  /** The member the gateway takes the command for, or null. */
  you: Member | null;
  /** The version of Shrimpy the gateway runs. */
  version: string;
}

/**
 * Link to the gateway at `place` with `token`, as one command does: on this
 * machine's socket a gateway that is not there is a `GatewayNotRunningError`, and
 * one at an address that can't be reached is an error that says where. An entry
 * that doesn't prove it is yours says so as the contract says it. A hello the
 * gateway turns away is what `turnedAway` makes of it. Aborting `signal` gives
 * up, even on a gateway that has stopped answering.
 */
async function linkTo(
  place: DialPlace,
  token: string | null,
  turnedAway: (error: HelloRefusedError) => Error,
  signal?: AbortSignal,
): Promise<Client> {
  let client: Client;
  try {
    client = await connectClient({ place, token, ...(signal === undefined ? {} : { signal }) });
  } catch (error) {
    if (error instanceof HelloRefusedError) throw turnedAway(error);
    if (error instanceof UnprovenGatewayError || signal?.aborted === true) throw error;
    if ("path" in place) {
      if (nobodyThere(error)) throw new GatewayNotRunningError({ cause: error });
      throw error;
    }
    throw new Error(`The gateway at ${formatAddress(place)} can't be reached: ${asError(error).message}`, { cause: error });
  }
  // Hanging up ends a question the gateway has stopped answering.
  signal?.addEventListener("abort", () => void client.close(), { once: true });
  return client;
}

/** Link to the gateway as `who`. */
export const linkAs = (who: Me, signal?: AbortSignal): Promise<Client> =>
  linkTo(who.place, who.token, (error) => who.turnedAway(error), signal);

/**
 * Use a link to the gateway the command reaches for the length of `use`, which
 * is told who the command is: the one on this machine, or the one the shell's
 * agent, when it is apart from the gateway, or the person's machine, when it has
 * joined one, reaches over its entry. There is no gateway on this machine when
 * none runs, which gives undefined.
 */
async function withGateway<T>(
  signal: AbortSignal | undefined,
  use: (client: Client, who: Me) => Promise<T>,
): Promise<T | undefined> {
  const who = me();
  let client: Client;
  try {
    client = await linkAs(who, signal);
  } catch (error) {
    if (error instanceof GatewayNotRunningError) return undefined;
    throw error;
  }
  try {
    return await use(client, who);
  } finally {
    await client.close();
  }
}

/** Use a link to the gateway, as withGateway has it, for the length of `use`. With no gateway the error says what to start. */
export async function withGatewayAsMe<T>(use: (client: Client, who: Me) => Promise<T>): Promise<T> {
  const used = await withGateway(undefined, async (client, who) => ({ value: await use(client, who) }));
  if (used === undefined) throw new Error(`No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`);
  return used.value;
}

/** What the gateway `client` is linked to says, as whoever the client is. */
export async function viewOf(client: Client, signal?: AbortSignal): Promise<GatewayView> {
  const roster = await client.host.get(Roster, {}, contextOf(signal));
  try {
    return { programs: roster.programs.value, members: roster.members.value, you: roster.you.value, version: client.version };
  } finally {
    roster.release();
  }
}

/** What the gateway the command reaches says, or undefined when no gateway is running on this machine. */
export function askGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  return withGateway(signal, (client) => viewOf(client, signal));
}

/**
 * What the gateway on this machine says, or undefined when none runs here:
 * whoever runs the command, and whatever the Shrimpy folder has joined. For a
 * command that starts what is missing on this machine.
 */
export async function askLocalGateway(signal?: AbortSignal): Promise<GatewayView | undefined> {
  let client: Client;
  try {
    client = await linkTo({ path: gatewaySocket() }, null, (error) => new Error(error.message, { cause: error }), signal);
  } catch (error) {
    if (error instanceof GatewayNotRunningError) return undefined;
    throw error;
  }
  try {
    return await viewOf(client, signal);
  } finally {
    await client.close();
  }
}
