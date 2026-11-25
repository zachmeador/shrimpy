import type { RosterEntry } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { renderTable } from "./table.ts";

/**
 * The roster as a table: each member's name and kind, whether it is an admin,
 * whether a program is linked as it, the account and machine an agent last
 * linked from, as in shrimpy@cashmoney, and its ID.
 */
export function renderMembers(members: readonly RosterEntry[]): string[] {
  const yesNo = (flag: boolean): string => (flag ? "yes" : "no");
  const machine = (member: RosterEntry): string =>
    member.where === null ? "-" : `${oneLine(member.where.machine.account)}@${oneLine(member.where.machine.host)}`;
  const rows = members.map((member) => [member.name, member.kind, yesNo(member.admin), yesNo(member.reachable), machine(member), member.id]);
  return renderTable(["name", "kind", "admin", "reachable", "machine", "id"], rows);
}
