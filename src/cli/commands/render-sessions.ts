import { placeWords, type SessionSummary } from "../../contracts/agent/index.ts";
import { renderTable } from "./table.ts";

/**
 * The sessions of an agent as a table: each one's name, where it is, and
 * whether it is working. A session whose place the agent has not learned yet
 * is somewhere unknown.
 */
export function renderSessions(sessions: SessionSummary[]): string[] {
  const where = (session: SessionSummary): string => (session.place === null ? "unknown" : placeWords(session.place, session.id));
  const rows = sessions.map((session) => [session.id, where(session), session.working ? "working" : "idle"]);
  return renderTable(["session", "where", "state"], rows);
}
