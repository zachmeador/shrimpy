import type { Member } from "../../contracts/chat/index.ts";
import type { Sql } from "./sql.ts";

export type MemberRow = { id: string; kind: Member["kind"]; name: string };

export const toMember = (row: MemberRow): Member => ({ id: row.id, kind: row.kind, name: row.name });

export interface MemberOperations {
  /** The member on record, if any. */
  member(id: string): Member | undefined;
  /** Record a member, or give one already on record its new name. */
  saveMember(member: Member): void;
  /** Record a member the store has not seen yet, and leave one on record as it is. */
  addMember(member: Member): void;
}

export function memberOperations(sql: Sql): MemberOperations {
  return {
    member(id) {
      const row = sql.one("SELECT id, kind, name FROM members WHERE id = ?", id) as MemberRow | undefined;
      return row === undefined ? undefined : toMember(row);
    },
    saveMember(member) {
      sql.run(
        `INSERT INTO members (id, kind, name) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
        member.id,
        member.kind,
        member.name,
      );
    },
    addMember(member) {
      sql.run(
        "INSERT OR IGNORE INTO members (id, kind, name) VALUES (?, ?, ?)",
        member.id,
        member.kind,
        member.name,
      );
    },
  };
}
