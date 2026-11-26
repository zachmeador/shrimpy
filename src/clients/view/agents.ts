import { channelLabel, roomLabel } from "../../contracts/chat/index.ts";
import { NO_AGENT_YET } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { type AgentEntry, agentEntries, gatewayAhead, type Model, readOnlyEntries, roomEntries, turnedAwayBehind } from "../state/index.ts";
import type { LevelOptions, Row } from "./level.ts";
import { lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { agentDetail, agentsTitle, behindNote, membersLine, NOT_RUNNING, readOnlyDetail, TURNED_AWAY, waitingOnLine } from "./words.ts";

/** The first level: the agents on the roster, running or not, the rooms the person is in, and the rooms they only read. */
export interface AgentsLevel {
  title: string;
  /** The list may be out of date: the gateway is not being reached. No one is said to work while it is. */
  stale: boolean;
  rows: Row[];
  /** What to say instead of an empty list, if there is something to say. */
  empty: string | undefined;
  /**
   * How many messages are new to the person in all: in their DMs with agents
   * and in the rooms they are in. The rooms they only read are left out.
   */
  unread: number;
  /** What is not working, or has just gone wrong, most pressing first: each a line the person should read, apart from the list. */
  notes: string[];
  /**
   * The version to offer to put on this machine, in a client that updates its
   * machine, when the gateway turns the client away for the release it runs and
   * runs a newer one.
   */
  update: string | undefined;
}

/**
 * How an agent stands, as its row and its list say it: working (turn or
 * background command), waiting on another agent, idle, not running, or turned
 * away. An agent that only waits on another says so in words with no lantern.
 */
export function agentAbout(entry: AgentEntry, me: string | undefined): string {
  if (!entry.running) return entry.away === undefined ? NOT_RUNNING : TURNED_AWAY;
  if (entry.working) return agentDetail(entry.sessions, entry.elsewhere, me);
  if (entry.waiting.length > 0) return waitingOnLine(entry.waiting, false);
  return "idle";
}

/** The agents and rooms, as plain text and facts. */
export function agentsLevel(model: Model, options: LevelOptions): AgentsLevel {
  const stale = model.gateway.state === "down" && model.listing !== undefined;
  const agents: Row[] = agentEntries(model).map((entry) => ({
    id: entry.id,
    kind: "agent",
    label: oneLine(entry.name),
    name: oneLine(entry.name),
    tags: [],
    detail: agentAbout(entry, model.me?.name),
    working: entry.working && !stale,
    unread: entry.unread,
    yours: false,
    look: lookOf(model, entry.id),
  }));
  const rooms: Row[] = roomEntries(model).map((entry) => ({
    id: entry.id,
    kind: "room",
    label: roomLabel(entry.name),
    name: oneLine(entry.name),
    tags: [],
    detail: membersLine(entry.members),
    working: entry.working && !stale,
    unread: entry.unread,
    yours: false,
    look: undefined,
  }));
  const reading: Row[] = readOnlyEntries(model).map(({ channel, working, unread }) => ({
    id: channel.id,
    kind: "read-only",
    label: channelLabel(channel),
    name: oneLine(channel.name),
    tags: [],
    detail: readOnlyDetail(channel),
    working: working && !stale,
    unread,
    yours: false,
    look: undefined,
  }));
  const rows = [...agents, ...rooms, ...reading];
  return {
    title: agentsTitle(),
    stale,
    rows,
    empty: rows.length === 0 && model.gateway.state === "up" && model.listing !== undefined ? NO_AGENT_YET : undefined,
    unread: [...agents, ...rooms].reduce((sum, row) => sum + row.unread, 0),
    notes: [
      ...notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
      ...(options.updates === true ? behind(model) : []),
    ],
    update: options.updates === true ? turnedAwayBehind(model) : undefined,
  };
}

function behind(model: Model): string[] {
  const gateway = gatewayAhead(model);
  return gateway === undefined ? [] : [behindNote(gateway)];
}
