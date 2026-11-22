import type { TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Client,
  type Invitation,
  type Member,
  type Program,
  Roster,
  type RosterEntry,
  valueOf,
  type WayIn,
} from "../../contracts/gateway/index.ts";
import { connectClient, gatewaySocket } from "../../contracts/gateway/node.ts";
import type { DialPlace } from "../../lib/link/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";

const context = BACKGROUND_CONTEXT;

/** Someone on the roster of a gateway, as a test speaks for them. Each call answers with what it did, or fails with what was refused. */
export interface OnTheRoster {
  /** The link, which holds the other programs' objects too. */
  readonly client: Client;
  members(): Promise<RosterEntry[]>;
  programs(): Promise<Program[]>;
  ways(): Promise<WayIn[]>;
  invite(name: string): Promise<Invitation>;
  inviteDevice(): Promise<Invitation>;
  /** Make the member `member` an admin, or an ordinary agent again, and say what it is now. */
  setAdmin(member: string, admin: boolean): Promise<Member>;
  remove(member: string): Promise<void>;
  takeBack(way: string): Promise<void>;
}

/**
 * Whoever `token` is on the gateway at `place`, linked until the test ends:
 * you, by default, on this machine's gateway socket, with no token.
 */
export async function onTheRoster(t: TestContext, place: DialPlace = { path: gatewaySocket() }, token: string | null = null): Promise<OnTheRoster> {
  const client = await connectClient({ place, token });
  stopAfter(t, () => client.close());
  const roster = await client.host.get(Roster, {}, context);
  stopAfter(t, () => roster.release());
  return {
    client,
    members: async () => roster.members.value,
    programs: async () => roster.programs.value,
    ways: async () => roster.ways.value,
    invite: async (name) => valueOf(await roster.invite({ name }, context)),
    inviteDevice: async () => valueOf(await roster.inviteDevice(context)),
    setAdmin: async (member, admin) =>
      valueOf(admin ? await roster.promote({ member }, context) : await roster.demote({ member }, context)),
    async remove(member) {
      valueOf(await roster.remove({ member }, context));
    },
    async takeBack(way) {
      valueOf(await roster.takeBack({ way }, context));
    },
  };
}

/** Make the member `member` an admin, or an ordinary agent again, as you on this machine's gateway, and say what it is now. */
export async function setAdmin(t: TestContext, member: string, admin: boolean): Promise<Member> {
  return (await onTheRoster(t)).setAdmin(member, admin);
}
