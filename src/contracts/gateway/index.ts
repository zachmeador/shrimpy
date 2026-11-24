/**
 * The gateway's contract, and what every contract shares: the hosts and their
 * addresses, who is asking, a method's answer and refusal, calling a method of
 * another program's object, the hello every caller says before Chord, a
 * client's link once it is welcomed, the roster as `Roster`, and as a program
 * holds it live, `Notifications`, where the chat server hands the gateway
 * what to tell you on your devices, `WorkspaceContext`, the notes every agent
 * is shown, the rule for a name and how names are
 * compared, the invitation's link and the page's, with what a machine of yours
 * keeps, the page's door as the page sees it, with where a browser is told
 * things, and the page's link to it, and what every client tells a person to
 * start when the gateway, the chat server or an agent isn't linked. It must not
 * know what the programs say to each other through the gateway. This door is
 * safe for browsers; `node.ts` adds linking from Node.
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
export { contextOf, holding, isLost, isOtherVersion, unlessRefused, valueOf } from "./calls.ts";
export { type Client } from "./client.ts";
export {
  type Answering,
  compareShrimpy,
  type Hello,
  type HelloAnswer,
  hello,
  HelloRefusedError,
  linksWith,
  newerThanGateway,
  notAHello,
  otherRelease,
  readAnswer,
  readHello,
  readVersions,
  turnAway,
  UnknownAnswerError,
  type Versions,
  waitingOnVersion,
  type Welcome,
  welcome,
  type Welcomed,
  type Who,
  whyTurnedAway,
} from "./hello.ts";
export { agent, chat, gateway } from "./hosts.ts";
export { type Link, readLink, readPageCode, writeLink, writePageLink } from "./link.ts";
export { createLiveRoster, type LiveRoster, type RosterNow } from "./live-roster.ts";
export { type Machine, MACHINE_FILE, machineFile } from "./machine.ts";
export { fitName, MAX_NAME, NAME_RULE, nameKey } from "./names.ts";
export { type Notification, Notifications, readNotification } from "./notifications.ts";
export {
  helloFromPage,
  PAGE_JOIN,
  PAGE_LINK,
  PAGE_PUSH,
  type PageFile,
  type PageHelloOptions,
  type PageJoin,
  type PagePush,
  type PagePushKey,
  pageLinkUrl,
  readPageJoin,
  readPagePush,
} from "./page.ts";
export { type Principal, type Revocation, revokedBy, type Way } from "./principals.ts";
export {
  type DeviceInvitation,
  type Invitation,
  type Member,
  MEMBER_FIELDS,
  noMember,
  type Program,
  Roster,
  type RosterEntry,
  type TurnedAwayProgram,
  type WayIn,
} from "./roster.ts";
export { isToken } from "./token.ts";
export { GATEWAY_NOT_RUNNING, howToStartAgent, NO_AGENT_YET, NO_CHAT_SERVER, NO_GATEWAY } from "./words.ts";
export { WorkspaceContext, type WorkspaceFile } from "./workspace.ts";
