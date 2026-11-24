import { defineFacet, type Facet } from "@earendil-works/chord";
import {
  type Member,
  Notifications,
  type Principal,
  Roster,
  type WayIn,
  WorkspaceContext,
  type WorkspaceFile,
} from "../../contracts/gateway/index.ts";
import { type Actions, deviceInvitationV1 } from "./actions.ts";
import type { GatewayView, View } from "./view.ts";

/** The member `caller` is, in `view`, or null for a program that isn't one. */
function youIn(view: GatewayView, caller: Principal): Member | null {
  if (caller.kind !== "person" && caller.kind !== "agent") return null;
  const entry = view.members.find((member) => member.id === caller.member);
  return entry === undefined ? null : { id: entry.id, kind: entry.kind, name: entry.name, admin: entry.admin };
}

/** The ways in `caller` sees: all of them for you, the agents' for an admin, and none for anyone else. */
function waysFor(view: GatewayView, caller: Principal): WayIn[] {
  if (caller.kind === "person") return view.ways;
  if (caller.kind !== "agent") return [];
  const admin = view.members.find((member) => member.id === caller.member)?.admin === true;
  return admin ? view.ways.filter((way) => way.kind === "token") : [];
}

/**
 * The objects the gateway serves: `Roster`, one for each caller, following the
 * view, at its first version too, for a program of an older Shrimpy;
 * `Notifications`, where the chat server hands over what to tell you; and
 * `WorkspaceContext`, following the files of the workspace context, the same
 * for every caller.
 */
export function gatewayFacet(view: View<GatewayView>, workspace: View<WorkspaceFile[]>, actions: Actions): Facet<Principal> {
  return defineFacet<Principal>((host) => {
    host.serve(WorkspaceContext, (_params, _caller, self) => ({ variant: "all", members: { files: self.follow(workspace.follow) } }));
    host.serve(Notifications, (_params, caller) => ({
      variant: "all",
      members: { notify: async (notification) => actions.notify(caller, notification) },
    }));
    host.serve(
      Roster,
      (_params, caller, self) => {
        const followed = self.follow(view.follow);
        return {
          variant: "all",
          members: {
            id: self.derive([followed], ([current]) => current.id),
            you: self.derive([followed], ([current]) => youIn(current, caller)),
            members: self.derive([followed], ([current]) => current.members),
            programs: self.derive([followed], ([current]) => current.programs),
            ways: self.derive([followed], ([current]) => waysFor(current, caller)),
            invite: async ({ name }) => actions.invite(caller, name),
            inviteDevice: async () => actions.inviteDevice(caller),
            promote: async ({ member }) => actions.setAdmin(caller, member, true),
            demote: async ({ member }) => actions.setAdmin(caller, member, false),
            remove: async ({ member }) => actions.remove(caller, member),
            takeBack: async ({ way }) => actions.takeBack(caller, way),
          },
        };
      },
      { accepts: { 1: { methods: { inviteDevice: { result: deviceInvitationV1 } } } } },
    );
  });
}
