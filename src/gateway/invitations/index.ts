/**
 * Invitations: a code that lets one agent in from apart, or one machine of a
 * person's own. Single-use, short-lived and good for what it was made for only
 * (one name, or one person), so whoever holds one can't take another. It must
 * not know how a code is asked for or handed over, or who the members are.
 */
export {
  type Checked,
  type CheckedForMachine,
  createInvitations,
  INVITATION_MS,
  type Invitations,
  type InvitationsOptions,
  type Issued,
} from "./invitations.ts";
