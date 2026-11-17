/**
 * The gateway's contract, and what every contract shares: the hosts and their
 * addresses, who is asking, a method's answer and refusal, calling a method of
 * another program's object, the hello every caller says before Chord, the
 * roster as `Roster`, and as a program holds it live, the rule for a name and
 * how names are compared, and the invitation's link with what a machine of
 * yours keeps. It must not know what the programs say to each other through the
 * gateway. This door is safe for browsers; `node.ts` adds linking, which needs
 * Node.
 */
export { type Address, type Entry, readAddress, readEntry } from "./address.ts";
export {
  type Answer,
  answerOf,
  done,
  needsAdmin,
  type Reason,
  type Refused,
  refused,
  RefusedSchema,
} from "./answers.ts";
export { contextOf, holding, isLost, unlessRefused, valueOf } from "./calls.ts";
export {
  type Hello,
  type HelloAnswer,
  hello,
  otherPi,
  readAnswer,
  readHello,
  readVersions,
  samePi,
  turnAway,
  versionWarning,
  type Welcome,
  welcome,
  type Who,
} from "./hello.ts";
export { agent, chat, gateway } from "./hosts.ts";
export { type Link, readLink, writeLink } from "./link.ts";
export { createLiveRoster, type LiveRoster, type RosterNow } from "./live-roster.ts";
export { type Machine, MACHINE_FILE, machineFile } from "./machine.ts";
export { fitName, MAX_NAME, NAME_RULE, nameKey } from "./names.ts";
export { type Principal, type Revocation, revokedBy, type Way } from "./principals.ts";
export {
  type Invitation,
  type Member,
  MEMBER_FIELDS,
  type Program,
  Roster,
  type RosterEntry,
  type WayIn,
} from "./roster.ts";
export { isToken } from "./token.ts";
