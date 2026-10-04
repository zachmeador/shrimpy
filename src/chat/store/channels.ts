import type { Member } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { type MemberRow, toMember } from "./members.ts";
import type { Sql } from "./sql.ts";
import { insertThread } from "./threads.ts";

/** A channel as stored. A DM has no name of its own; each side sees the other member's. */
export interface ChannelRecord {
  id: string;
  kind: "dm" | "room";
  name: string | null;
  /** In order of ID, so every member sees the same list. */
  members: Member[];
}

type ChannelMemberRow = MemberRow & {
  channel_id: string;
  channel_kind: ChannelRecord["kind"];
  channel_name: string | null;
};

const CHANNEL_WITH_MEMBERS = `
  SELECT c.id AS channel_id, c.kind AS channel_kind, c.name AS channel_name,
         m.id, m.kind, m.name
  FROM channels c
  JOIN memberships s ON s.channel_id = c.id
  JOIN members m ON m.id = s.member_id`;

export interface ChannelOperations {
  channel(id: string): ChannelRecord | undefined;
  /** The channels a member belongs to, oldest first. */
  channelsOf(memberId: string): ChannelRecord[];
  /** The DM between two members, in either order. */
  directChannel(first: string, second: string): ChannelRecord | undefined;
  /** Open a DM between two members already on record, with its main thread. */
  createDirectChannel(first: Member, second: Member, now: number): ChannelRecord;
}

const directKey = (first: string, second: string): string => JSON.stringify([first, second].sort());

function group(rows: ChannelMemberRow[]): ChannelRecord[] {
  const channels = new Map<string, ChannelRecord>();
  for (const row of rows) {
    let channel = channels.get(row.channel_id);
    if (channel === undefined) {
      channel = { id: row.channel_id, kind: row.channel_kind, name: row.channel_name, members: [] };
      channels.set(row.channel_id, channel);
    }
    channel.members.push(toMember(row));
  }
  return [...channels.values()];
}

export function channelOperations(sql: Sql): ChannelOperations {
  const channel = (id: string): ChannelRecord | undefined => {
    const rows = sql.all(
      `${CHANNEL_WITH_MEMBERS} WHERE c.id = ? ORDER BY m.id`,
      id,
    ) as ChannelMemberRow[];
    return group(rows)[0];
  };
  return {
    channel,
    channelsOf(memberId) {
      const rows = sql.all(
        `${CHANNEL_WITH_MEMBERS}
         WHERE c.id IN (SELECT channel_id FROM memberships WHERE member_id = ?)
         ORDER BY c.rowid, m.id`,
        memberId,
      ) as ChannelMemberRow[];
      return group(rows);
    },
    directChannel(first, second) {
      const row = sql.one("SELECT id FROM channels WHERE direct_key = ?", directKey(first, second)) as
        | { id: string }
        | undefined;
      return row === undefined ? undefined : channel(row.id);
    },
    createDirectChannel(first, second, now) {
      const id = newId("ch");
      sql.run(
        "INSERT INTO channels (id, kind, name, direct_key) VALUES (?, 'dm', NULL, ?)",
        id,
        directKey(first.id, second.id),
      );
      for (const member of [first, second]) {
        sql.run("INSERT INTO memberships (channel_id, member_id) VALUES (?, ?)", id, member.id);
      }
      insertThread(sql, { channelId: id, name: null, main: true, now });
      const created = channel(id);
      if (created === undefined) throw new Error(`Channel ${id} was not created`);
      return created;
    },
  };
}
