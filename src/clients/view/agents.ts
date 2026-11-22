import { channelLabel, roomLabel } from "../../contracts/chat/index.ts";
import { NO_AGENT_YET } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { type AgentEntry, agentEntries, type Model, readOnlyEntries, roomEntries } from "../state/index.ts";
import type { LevelOptions, Row } from "./level.ts";
import { lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { agentDetail, agentsTitle, membersLine, NOT_RUNNING, readOnlyDetail } from "./words.ts";

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
}

/** How an agent stands, as its row and its list say it: idle or working, and where, or that it is not running. */
export function agentAbout(entry: AgentEntry, me: string | undefined): string {
  return entry.running ? agentDetail(entry.sessions, entry.elsewhere, me) : NOT_RUNNING;
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
  // The rooms the person is not in come last, apart from their own.
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
    notes: notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
  };
}
