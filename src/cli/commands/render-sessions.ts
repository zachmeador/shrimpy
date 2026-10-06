import type { SessionPlace, SessionSummary } from "../../contracts/agent/index.ts";
import { renderTable } from "./table.ts";

/**
 * Where a session is, in words: a DM with someone, or a room, and the thread when
 * it is not the channel's main one, or the trigger a session of its own is for.
 * A session whose place the agent has not learned yet says so.
 */
export function placeInWords(place: SessionPlace | null): string {
  if (place === null) return "unknown";
  if (place.kind === "trigger") return `trigger ${place.trigger}`;
  const where = place.kind === "dm" ? `DM with ${place.with.name} (${place.with.kind === "person" ? "a person" : "an agent"})` : `room #${place.room}`;
  const { main, name } = place.thread;
  if (main) return where;
  return name === null ? `${where}, a side thread` : `${where}, thread "${name}"`;
}

/** The sessions of an agent as a table: each one's name, where it is, and whether it is working. */
export function renderSessions(sessions: SessionSummary[]): string[] {
  const rows = sessions.map((session) => [session.id, placeInWords(session.place), session.working ? "working" : "idle"]);
  return renderTable(["session", "where", "state"], rows);
}
