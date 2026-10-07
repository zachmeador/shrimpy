/**
 * Invitations: a code that lets one agent in from apart. Single-use,
 * short-lived and good for one name only, so whoever holds one can't take
 * another. It must not know how a code is asked for or handed over, or who the
 * members are.
 */
export {
  type Checked,
  createInvitations,
  INVITATION_MS,
  type Invitations,
  type InvitationsOptions,
} from "./invitations.ts";
