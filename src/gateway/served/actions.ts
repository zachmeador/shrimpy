import type { Host } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import {
  type Address,
  type Answer,
  type DeviceInvitation,
  done,
  type Invitation,
  type Member,
  needsAdmin,
  type Notification,
  type Principal,
  refused,
  type Revocation,
} from "../../contracts/gateway/index.ts";
import type { Invitations } from "../invitations/index.ts";
import type { Programs } from "../programs/index.ts";
import type { Push } from "../push/index.ts";
import type { Roster } from "../roster/index.ts";

export interface ActionsDeps {
  readonly roster: Roster;
  readonly invitations: Invitations;
  readonly programs: Programs;
  readonly push: Push;
  readonly host: Host<Principal, Revocation>;
  /** The addresses the gateway's entry listens on now, which an invitation sends whoever uses it to. */
  addresses(): Address[];
  /** Where a browser opens the page the gateway serves, which an invitation for a device carries, or undefined when it serves none. */
  page(): string | undefined;
  /** The fingerprint of the gateway's key, which an invitation carries for whoever uses it to check the entry against. */
  readonly fingerprint: string;
  readonly context: Context;
}

/** The refusal of an invitation nobody could use, from a gateway whose entry listens nowhere. */
const NOWHERE = refused(
  "This gateway listens on no address, so nobody could use an invitation. Start it with one, such as its tailnet address.",
);

/**
 * An invitation for a device as version 1 of `Roster` answers it, to a caller
 * that runs an older Shrimpy: with no page's address, and refused where only a
 * browser could use it, since version 1 promised an address.
 */
export function deviceInvitationV1(answer: Answer<DeviceInvitation>): Answer<Invitation> {
  if (answer.kind === "refused") return answer;
  const { page: _page, ...invitation } = answer.value;
  return invitation.addresses.length === 0 ? NOWHERE : done(invitation);
}

/** What a caller of `Roster` may do with it, each checked against the roster as it is now, and what the chat server may hand over to tell you. */
export interface Actions {
  invite(caller: Principal, name: string): Answer<Invitation>;
  inviteDevice(caller: Principal): Answer<DeviceInvitation>;
  setAdmin(caller: Principal, member: string, admin: boolean): Answer<Member>;
  remove(caller: Principal, member: string): Answer<null>;
  takeBack(caller: Principal, way: string): Answer<null>;
  notify(caller: Principal, notification: Notification): Promise<Answer<null>>;
}

export function createActions(deps: ActionsDeps): Actions {
  const { roster, invitations, programs, host } = deps;

  /** The member the caller is, as the roster has it now, so a promotion counts at once. */
  const memberOf = (caller: Principal): Member | undefined =>
    caller.kind === "person" || caller.kind === "agent" ? roster.member(caller.member) : undefined;

  const admins = (): Member[] => roster.members().filter((member) => member.admin);

  const you = (): string => roster.you().name;

  const notAMember = refused("Only a member of the network may do that, and a program that isn't one may not.");

  const listening = (): Address[] | undefined => {
    const addresses = deps.addresses();
    return addresses.length === 0 ? undefined : addresses;
  };

  return {
    invite(caller, name) {
      const asking = memberOf(caller);
      if (asking === undefined) return notAMember;
      if (!asking.admin) return needsAdmin("Inviting an agent", asking, admins());
      const addresses = listening();
      if (addresses === undefined) return NOWHERE;
      const target = roster.canInvite(name);
      if (target.kind === "refused") return target;
      const { code, expires } = invitations.issue(target.value.name, target.value.member);
      return done({ code, addresses, fingerprint: deps.fingerprint, expires });
    },
    inviteDevice(caller) {
      if (caller.kind !== "person") {
        return refused(
          `Only ${you()} may invite a device: whoever uses the invitation comes in as ${you()}, with everything ${you()} may do, ` +
            "so no agent may ask for one, an admin included.",
        );
      }
      const addresses = deps.addresses();
      const page = deps.page() ?? null;
      if (addresses.length === 0 && page === null) return NOWHERE;
      const { code, expires } = invitations.issueForDevice(caller.member);
      return done({ code, addresses, fingerprint: deps.fingerprint, expires, page });
    },
    setAdmin(caller, member, admin) {
      const asking = memberOf(caller);
      if (asking === undefined) return notAMember;
      if (!asking.admin) return needsAdmin(admin ? "Promoting an agent" : "Demoting an agent", asking, admins());
      return roster.setAdmin(member, admin);
    },
    remove(caller, member) {
      const asking = memberOf(caller);
      if (asking === undefined) return notAMember;
      if (!asking.admin) return needsAdmin("Removing an agent", asking, admins());
      const removed = roster.remove(member);
      if (removed.kind === "refused") return removed;
      invitations.forgetMember(member);
      host.revoke({ member }, deps.context);
      programs.dropAgent(member);
      return done(null);
    },
    takeBack(caller, id) {
      const way = roster.ways().find((each) => each.id === id);
      if (way === undefined) return refused(`There is no way in ${id} on the roster. It may have been taken back already.`);
      if (caller.kind !== "person") {
        const asking = memberOf(caller);
        if (asking === undefined) return notAMember;
        if (way.kind === "device") {
          return refused(`Only ${you()} may take back a device's token, since a device is ${you()}: no agent may, an admin included.`);
        }
        if (!asking.admin) return needsAdmin("Taking back an agent's token", asking, admins());
      }
      roster.takeBack(id);
      host.revoke({ way: id }, deps.context);
      // Chord leaves a route link open, so the agent's own link is closed here.
      if (way.kind === "token") programs.dropAgent(way.member);
      return done(null);
    },
    async notify(caller, notification) {
      if (caller.kind !== "chat") return refused("Only the chat server hands the gateway something to tell you.");
      await deps.push.notify(notification);
      return done(null);
    },
  };
}
