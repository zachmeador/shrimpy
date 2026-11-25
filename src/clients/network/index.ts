/**
 * How a client reaches the programs it talks to: one link to the gateway,
 * kept across losses, through which it holds the roster, chat's channels and
 * threads with how many messages in each are new to the person, and each
 * agent's sessions, triggers and home's files and how it looks, as Chord
 * objects that stay live and come back by themselves after a loss; following
 * what it holds; and where a link stands, as data. It must not know what is
 * on screen, how anything is drawn, or what a program says beyond its
 * contract. It is the one part of a client that imports Chord: the rest sees
 * what each object shows and the calls it takes, as plain values. The link is
 * handed how to dial: from a page, which this door has, or from Node. This
 * door is safe for browsers; `node.ts` adds dialing from Node.
 */
export { type Dial, type DialOptions, type GatewayLink, keepGateway } from "./link.ts";
export {
  type AgentCalls,
  type AgentShown,
  type ChannelShown,
  type ChatCalls,
  type ChatShown,
  holdAgent,
  holdChannel,
  holdChat,
  type Holding,
  holdRoster,
  holdSession,
  holdThread,
  type RosterCalls,
  type RosterShown,
  type SessionCalls,
  type SessionShown,
  type ThreadShown,
} from "./objects.ts";
export { dialPage } from "./page.ts";
export { CONNECTING, Down, type LinkStatus, type Problem, problemOf, type Why } from "./status.ts";
