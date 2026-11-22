import { channelLabel, memberNames, roomLabel } from "../../contracts/chat/index.ts";
import { NO_AGENT_YET } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentEntries, type Model, readOnlyEntries, roomEntries } from "../state/index.ts";
import type { LevelOptions, Row } from "./level.ts";
import { lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { agentDetail, agentsTitle, readOnlyDetail } from "./words.ts";

/** The first level: the agents on the roster, running or not, the rooms the person is in, and the rooms they only read. */
export interface AgentsLevel {
  title: string;
  /** The list may be out of date: the gateway is not being reached. */
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

/** The agents and rooms, as plain text and facts. */
export function agentsLevel(model: Model, options: LevelOptions): AgentsLevel {
  const agents: Row[] = agentEntries(model).map((entry) => ({
    id: entry.id,
    kind: "agent",
    label: oneLine(entry.name),
    detail: entry.running ? agentDetail(entry.sessions, entry.elsewhere, model.me?.name) : "not running",
    working: entry.working,
    unread: entry.unread,
    look: lookOf(model, entry.id),
  }));
  const rooms: Row[] = roomEntries(model).map((entry) => ({
    id: entry.id,
    kind: "room",
    label: roomLabel(entry.name),
    detail: [memberNames(entry.members).join(", "), entry.working ? "working" : undefined].filter((part) => part !== undefined && part !== "").join(" · "),
    working: entry.working,
    unread: entry.unread,
    look: undefined,
  }));
  // The rooms the person is not in come last, apart from their own.
  const reading: Row[] = readOnlyEntries(model).map(({ channel, working, unread }) => ({
    id: channel.id,
    kind: "read-only",
    label: channelLabel(channel),
    detail: readOnlyDetail(channel, working),
    working,
    unread,
    look: undefined,
  }));
  const rows = [...agents, ...rooms, ...reading];
  return {
    title: agentsTitle(),
    stale: model.gateway.state === "down" && model.listing !== undefined,
    rows,
    empty: rows.length === 0 && model.gateway.state === "up" && model.listing !== undefined ? NO_AGENT_YET : undefined,
    unread: [...agents, ...rooms].reduce((sum, row) => sum + row.unread, 0),
    notes: notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
  };
}
