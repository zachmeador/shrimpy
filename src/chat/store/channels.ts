import type { Member } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { type MemberRow, toMember } from "./members.ts";
import type { Sql } from "./sql.ts";
import { insertThread } from "./threads.ts";

/** A channel as stored. A DM has no name of its own; each side sees the other member's. A room's is its own. */
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
  /** The room called `name`, whatever the case, if there is one. It is any room, whether or not the caller is in it. */
  roomNamed(name: string): ChannelRecord | undefined;
  /** Make a room with its main thread, with members already on record in it. No other room may have its name. */
  createRoom(name: string, members: Member[], now: number): ChannelRecord;
  /** Put members already on record in a channel. One that is in already stays as it is. */
  addToChannel(channelId: string, members: Member[]): ChannelRecord;
}

const directKey = (first: string, second: string): string => JSON.stringify([first, second].sort());

/** The key under which no two rooms share a name: the name in lower case, as names are compared everywhere. */
const roomKey = (name: string): string => name.toLowerCase();

/**
 * A member joins a channel at the end of the log, so the events it is offered
 * are the ones that come after, never those from before it joined.
 */
function join(sql: Sql, channelId: string, memberId: string): void {
  sql.run(
    `INSERT OR IGNORE INTO memberships (channel_id, member_id, since_seq)
     VALUES (?, ?, (SELECT coalesce(max(seq), 0) FROM events))`,
    channelId,
    memberId,
  );
}

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
  const stored = (id: string): ChannelRecord => {
    const found = channel(id);
    if (found === undefined) throw new Error(`Channel ${id} was not found`);
    return found;
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
      for (const member of [first, second]) join(sql, id, member.id);
      insertThread(sql, { channelId: id, name: null, main: true, now });
      return stored(id);
    },
    roomNamed(name) {
      const row = sql.one("SELECT id FROM channels WHERE room_key = ?", roomKey(name)) as { id: string } | undefined;
      return row === undefined ? undefined : channel(row.id);
    },
    createRoom(name, members, now) {
      const id = newId("ch");
      sql.run("INSERT INTO channels (id, kind, name, room_key) VALUES (?, 'room', ?, ?)", id, name, roomKey(name));
      for (const member of members) join(sql, id, member.id);
      insertThread(sql, { channelId: id, name: null, main: true, now });
      return stored(id);
    },
    addToChannel(channelId, members) {
      for (const member of members) join(sql, channelId, member.id);
      return stored(channelId);
    },
  };
}
