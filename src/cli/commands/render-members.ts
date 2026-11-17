import type { RosterEntry } from "../../contracts/gateway/index.ts";
import { renderTable } from "./table.ts";

/** The roster as a table: each member's name and kind, whether it is an admin, whether a program is linked as it, and its ID. */
export function renderMembers(members: readonly RosterEntry[]): string[] {
  const yesNo = (flag: boolean): string => (flag ? "yes" : "no");
  const rows = members.map((member) => [member.name, member.kind, yesNo(member.admin), yesNo(member.reachable), member.id]);
  return renderTable(["name", "kind", "admin", "reachable", "id"], rows);
}
