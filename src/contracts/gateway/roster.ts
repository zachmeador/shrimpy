import { arr, bool, map, method, nul, num, obj, oneOf, remote, type Static, str, union } from "@earendil-works/chord";
import { AddressSchema } from "./address.ts";
import { answerOf } from "./answers.ts";
import { gateway } from "./hosts.ts";

/**
 * What every contract names a member by: its ID, minted once and never
 * changed, whether it is you or an agent, and its name, a label the roster
 * binds to it, unique among members whatever the case, so `@name` means one
 * member. Chat names a member by these alone.
 */
export const MEMBER_FIELDS = { id: str(), kind: oneOf("person", "agent"), name: str() };

const ON_THE_ROSTER = { ...MEMBER_FIELDS, admin: bool() };

/**
 * Someone on the network, you or an agent, with whether it is an admin. Every
 * person is one, the first agent on a roster starts as one, and any other agent
 * is one once promoted.
 */
export const MemberSchema = obj(ON_THE_ROSTER);
export type Member = Static<typeof MemberSchema>;

/** A member as the roster lists it, with whether it is reachable: an agent whose program is linked and answering. */
const RosterEntrySchema = obj({ ...ON_THE_ROSTER, reachable: bool() });
export type RosterEntry = Static<typeof RosterEntrySchema>;

/** A program linked to the gateway now, with the Shrimpy version its hello gave. The chat server is no member. */
const ProgramSchema = obj({
  kind: oneOf("agent", "chat"),
  name: str(),
  member: union([str(), nul()]),
  shrimpy: str(),
});
export type Program = Static<typeof ProgramSchema>;

/**
 * A program the gateway turned away for the release it runs, the last time it
 * tried, until it links: an agent, by its member, or the chat server, with the
 * Shrimpy version and the Pi packages its hello gave.
 */
const TurnedAwaySchema = obj({
  kind: oneOf("agent", "chat"),
  name: str(),
  member: union([str(), nul()]),
  shrimpy: str(),
  pi: map(str()),
});
export type TurnedAwayProgram = Static<typeof TurnedAwaySchema>;

/** A way in that a token opens, for a device of yours or an agent, with a device's label. */
const WayInSchema = obj({
  id: str(),
  kind: oneOf("device", "token"),
  member: str(),
  label: union([str(), nul()]),
});
export type WayIn = Static<typeof WayInSchema>;

const INVITATION = { code: str(), addresses: arr(AddressSchema), fingerprint: str(), expires: num() };

/**
 * What lets an agent or a device of yours in over the gateway's entry: a code
 * like `K7Q2-9FXD`, good once, for fifteen minutes and for what it was made
 * for, the addresses the gateway listens on, of which there is at least one,
 * and the fingerprint of the gateway's key, which whoever joins keeps and checks
 * the entry against from then on.
 */
const InvitationSchema = obj(INVITATION);
export type Invitation = Static<typeof InvitationSchema>;

/**
 * What lets a device of yours in: as an agent's invitation, and the address of
 * the page the gateway serves, which a browser opens with the code, or null
 * when it serves none. With a page, its addresses may be none, and then only a
 * browser can use it.
 */
const DeviceInvitationSchema = obj({ ...INVITATION, page: union([str(), nul()]) });
export type DeviceInvitation = Static<typeof DeviceInvitationSchema>;

/** That the roster has no member with the ID `id`, as the gateway and chat refuse it. */
export const noMember = (id: string): string => `There is no member ${id} on the roster.`;

/**
 * The roster as the caller sees it, at `gateway()`. Its state follows the
 * roster live, so a promotion, a rename or a member arriving shows at once.
 */
export const Roster = remote("shrimpy.gateway.roster", {
  version: 2,
  params: {},
  hostAddress: () => gateway(),
  variants: {
    all: {
      state: {
        /** The roster's ID, made with it and never changed. */
        id: str(),
        /** The member the caller is, or null for a program that isn't one. */
        you: union([MemberSchema, nul()]),
        /** Everyone, oldest first. */
        members: arr(RosterEntrySchema),
        /** The programs linked now. */
        programs: arr(ProgramSchema),
        /** The programs turned away for the release they run, with what each runs, so whoever reads it can say what to update. */
        turnedAway: arr(TurnedAwaySchema),
        /** Every way in for you, the agents' for an admin, and none for anyone else. */
        ways: arr(WayInSchema),
      },
      methods: {
        /**
         * An invitation for an agent called `name`, while the gateway listens
         * on an address. Only you or an admin. Naming an agent that exists makes
         * an invitation that replaces its token and updates its gateway key;
         * naming a person is refused.
         */
        invite: method(obj({ name: str() }), answerOf(InvitationSchema)),
        /** An invitation for a device of yours: a machine, named for itself when it joins, or a browser, which opens the page's address with the code. Only you. */
        inviteDevice: method(undefined, answerOf(DeviceInvitationSchema)),
        /** Makes an agent an admin, answering with it as it now is. Only you or an admin. */
        promote: method(obj({ member: str() }), answerOf(MemberSchema)),
        /** Makes an admin agent an ordinary agent again. Only you or an admin. */
        demote: method(obj({ member: str() }), answerOf(MemberSchema)),
        /** Removes an agent from the roster, ending its ways in and freeing its name; its ID is never used again. Only you or an admin. */
        remove: method(obj({ member: str() }), answerOf(nul())),
        /** Ends a way in at once, and everything it holds. You take back any, and an admin an agent's. */
        takeBack: method(obj({ way: str() }), answerOf(nul())),
      },
    },
  },
});
