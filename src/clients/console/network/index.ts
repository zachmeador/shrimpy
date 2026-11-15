/**
 * How the console reaches the programs it talks to: one link to the gateway,
 * kept across losses, through which it holds the roster, chat's channels and
 * threads, and each agent's sessions, as Chord objects that stay live and come
 * back by themselves after a loss; following what it holds; and where a link
 * stands, as data. It must not know what is on screen, how anything is drawn,
 * or what a program says beyond its contract. It is the one part of the
 * console that imports Chord: the rest sees what each object shows and the
 * calls it takes, as plain values.
 */
export { type GatewayLink, type GatewayLinkOptions, keepGateway } from "./link.ts";
export {
  type AgentCalls,
  type AgentShown,
  type ChannelCalls,
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
  type ThreadCalls,
  type ThreadShown,
} from "./objects.ts";
export { CONNECTING, Down, type LinkStatus, type Problem, problemOf, statusOf, UP, type Why } from "./status.ts";
