/** The tables' version. A store written by any other version is refused, never changed. */
export const SCHEMA_VERSION = 6;

/**
 * `events` is the log, and the one thing that gives positions. AUTOINCREMENT
 * keeps `seq` from ever being reused, so a cursor stays meaningful for the life
 * of the store. Every change to a message writes its event in the same
 * transaction as the change, and the events are never deleted.
 *
 * A message is what its events add up to, kept folded in `messages`. It takes
 * the position of the event that posted it, which is why a post has no
 * `target_seq`: it names the message it makes. `message_seq` is the message an
 * event names, either way.
 *
 * A receipt is an event too. It names the message of the event it answers, and
 * carries the receipt in `answers_seq`, `status`, `reply_seq` and `detail`.
 * `receipts` keeps the one that stands for each member and event, as
 * `reactions` keeps the emoji that stand.
 *
 * A DM is found by its `direct_key`, the two members' IDs in order, and a room
 * by its `room_key`, its name in lower case, which no other room has. A member
 * is offered a channel's events after its `since_seq`: the position of the
 * newest event when it joined, so that nothing from before comes with it.
 * `messages.answers_seq` is not written or read any more: a message does not
 * say which event it answers. The column stays, empty in every new row, until
 * the store's next change of shape removes it.
 */
export const SCHEMA = `
CREATE TABLE members (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('person', 'agent')),
  name TEXT NOT NULL
) STRICT;

CREATE TABLE channels (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'room')),
  name TEXT,
  direct_key TEXT UNIQUE,
  room_key TEXT UNIQUE,
  CHECK ((kind = 'dm') = (direct_key IS NOT NULL)),
  CHECK ((kind = 'room') = (name IS NOT NULL)),
  CHECK ((kind = 'room') = (room_key IS NOT NULL))
) STRICT;

CREATE TABLE memberships (
  channel_id TEXT NOT NULL REFERENCES channels (id),
  member_id TEXT NOT NULL REFERENCES members (id),
  since_seq INTEGER NOT NULL,
  PRIMARY KEY (channel_id, member_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX memberships_by_member ON memberships (member_id, channel_id);

CREATE TABLE threads (
  id TEXT NOT NULL PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels (id),
  main INTEGER NOT NULL CHECK (main IN (0, 1)),
  name TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  preview TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX threads_by_channel ON threads (channel_id, updated_at DESC, last_seq DESC);
CREATE UNIQUE INDEX one_main_thread_per_channel ON threads (channel_id) WHERE main = 1;

CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('posted', 'edited', 'deleted', 'reacted', 'unreacted', 'receipted')),
  channel_id TEXT NOT NULL REFERENCES channels (id),
  target_seq INTEGER REFERENCES messages (seq),
  message_seq INTEGER GENERATED ALWAYS AS (coalesce(target_seq, seq)) VIRTUAL,
  actor_id TEXT NOT NULL REFERENCES members (id),
  at INTEGER NOT NULL,
  text TEXT,
  emoji TEXT,
  answers_seq INTEGER REFERENCES events (seq),
  status TEXT CHECK (status IN ('answered', 'silent', 'stopped', 'skipped', 'failed')),
  reply_seq INTEGER REFERENCES messages (seq),
  detail TEXT,
  CHECK ((kind = 'posted') = (target_seq IS NULL)),
  CHECK ((kind IN ('posted', 'edited')) = (text IS NOT NULL)),
  CHECK ((kind IN ('reacted', 'unreacted')) = (emoji IS NOT NULL)),
  CHECK ((kind = 'receipted') = (answers_seq IS NOT NULL)),
  CHECK ((kind = 'receipted') = (status IS NOT NULL)),
  CHECK ((kind = 'receipted' AND status = 'answered') = (reply_seq IS NOT NULL)),
  CHECK ((kind = 'receipted' AND status = 'failed') = (detail IS NOT NULL))
) STRICT;
CREATE INDEX events_by_message ON events (message_seq, seq);

CREATE TABLE messages (
  seq INTEGER PRIMARY KEY REFERENCES events (seq),
  id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL REFERENCES channels (id),
  thread_id TEXT NOT NULL REFERENCES threads (id),
  author_id TEXT NOT NULL REFERENCES members (id),
  text TEXT NOT NULL,
  preview TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  addressed TEXT NOT NULL,
  answers_seq INTEGER REFERENCES events (seq)
) STRICT;
CREATE INDEX messages_by_thread ON messages (thread_id, seq);

CREATE TABLE reactions (
  message_seq INTEGER NOT NULL REFERENCES messages (seq),
  member_id TEXT NOT NULL REFERENCES members (id),
  emoji TEXT NOT NULL,
  event_seq INTEGER NOT NULL REFERENCES events (seq),
  PRIMARY KEY (message_seq, member_id, emoji)
) STRICT, WITHOUT ROWID;

CREATE TABLE receipts (
  event_seq INTEGER NOT NULL REFERENCES events (seq),
  member_id TEXT NOT NULL REFERENCES members (id),
  status TEXT NOT NULL CHECK (status IN ('answered', 'silent', 'stopped', 'skipped', 'failed')),
  reply_seq INTEGER REFERENCES messages (seq),
  detail TEXT,
  PRIMARY KEY (event_seq, member_id),
  CHECK ((status = 'answered') = (reply_seq IS NOT NULL)),
  CHECK ((status = 'failed') = (detail IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE posts (
  author_id TEXT NOT NULL REFERENCES members (id),
  request_id TEXT NOT NULL,
  message_seq INTEGER NOT NULL UNIQUE REFERENCES messages (seq),
  digest TEXT NOT NULL,
  PRIMARY KEY (author_id, request_id)
) STRICT, WITHOUT ROWID;
`;
