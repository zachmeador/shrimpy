/** The tables' version. A store written by any other version is refused, never changed. */
export const SCHEMA_VERSION = 10;

/**
 * `events` is the log, and the one thing that gives positions. AUTOINCREMENT
 * keeps `seq` from ever being reused, so a cursor stays meaningful for the life
 * of the store. Every change to a message writes its event in the same
 * transaction as the change, and the events are never deleted.
 *
 * A message is what its events add up to, kept folded in `messages`. It takes
 * the position of the event that posted it, which is why a post has no
 * `target_seq`: it names the message it makes. `message_seq` is the message an
 * event names, either way. A post or an edit keeps the members its text
 * mentioned then in its own `mentions`, since the message's are replaced at
 * each edit. A `fired` event makes a trigger's line the way a post makes a
 * message: the line is a row of `messages` with no text, and `trigger_lines`
 * keeps the trigger that fired.
 *
 * A receipt is an event too. It names the message of the event it answers, and
 * carries the receipt in `answers_seq`, `status`, `reply_seq` and `detail`.
 * `receipts` keeps the one that stands for each member and event, as
 * `reactions` keeps the emoji that stand. A failed receipt always has a
 * detail, a skipped or answered one may, and no other has one.
 *
 * A thread's `revision` counts the renames and archives that changed it, so
 * that a rename or an archive can name the revision it was decided on.
 *
 * A DM is found by its `direct_key`, the two members' IDs in order, and a room
 * by its `room_key`, its name in lower case, which no other room has. A member
 * is offered a channel's events after its `since_seq`: the position of the
 * newest event when it joined, so that nothing from before comes with it.
 *
 * `requests` keeps each request a member made of a message, by the member's
 * own ID for it: a post, an edit, a delete, a reaction or one taken back. It
 * names the message the request posted or changed, and keeps a digest of what
 * the request said, so that a retry can be told from another request that
 * reuses the ID.
 *
 * `read_marks` keeps a member's read mark in a thread: the position of the last
 * message it has seen there. A mark only moves forward. It is no event, so
 * nothing in the log or the feed tells of it.
 *
 * `store` has one row: the store's own ID, made when the store was and never
 * changed.
 */
export const SCHEMA = `
CREATE TABLE store (
  id TEXT NOT NULL
) STRICT;

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
  revision INTEGER NOT NULL DEFAULT 0,
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
  kind TEXT NOT NULL CHECK (kind IN ('posted', 'edited', 'deleted', 'reacted', 'unreacted', 'receipted', 'fired')),
  channel_id TEXT NOT NULL REFERENCES channels (id),
  target_seq INTEGER REFERENCES messages (seq),
  message_seq INTEGER GENERATED ALWAYS AS (coalesce(target_seq, seq)) VIRTUAL,
  actor_id TEXT NOT NULL REFERENCES members (id),
  at INTEGER NOT NULL,
  text TEXT,
  mentions TEXT,
  emoji TEXT,
  answers_seq INTEGER REFERENCES events (seq),
  status TEXT CHECK (status IN ('answered', 'silent', 'stopped', 'skipped', 'failed')),
  reply_seq INTEGER REFERENCES messages (seq),
  detail TEXT,
  CHECK ((kind IN ('posted', 'fired')) = (target_seq IS NULL)),
  CHECK ((kind IN ('posted', 'edited')) = (text IS NOT NULL)),
  CHECK ((kind IN ('posted', 'edited')) = (mentions IS NOT NULL)),
  CHECK ((kind IN ('reacted', 'unreacted')) = (emoji IS NOT NULL)),
  CHECK ((kind = 'receipted') = (answers_seq IS NOT NULL)),
  CHECK ((kind = 'receipted') = (status IS NOT NULL)),
  CHECK ((kind = 'receipted' AND status = 'answered') = (reply_seq IS NOT NULL)),
  CHECK (kind <> 'receipted' OR status <> 'failed' OR detail IS NOT NULL),
  CHECK (detail IS NULL OR (kind = 'receipted' AND status IN ('failed', 'skipped', 'answered')))
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
  mentions TEXT NOT NULL
) STRICT;
CREATE INDEX messages_by_thread ON messages (thread_id, seq);

CREATE TABLE trigger_lines (
  message_seq INTEGER NOT NULL PRIMARY KEY REFERENCES messages (seq),
  trigger TEXT NOT NULL,
  fired_at INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  output TEXT
) STRICT;

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
  CHECK (status <> 'failed' OR detail IS NOT NULL),
  CHECK (detail IS NULL OR status IN ('failed', 'skipped', 'answered'))
) STRICT, WITHOUT ROWID;

CREATE TABLE requests (
  member_id TEXT NOT NULL REFERENCES members (id),
  request_id TEXT NOT NULL,
  message_seq INTEGER NOT NULL REFERENCES messages (seq),
  digest TEXT NOT NULL,
  PRIMARY KEY (member_id, request_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE read_marks (
  member_id TEXT NOT NULL REFERENCES members (id),
  thread_id TEXT NOT NULL REFERENCES threads (id),
  message_seq INTEGER NOT NULL REFERENCES messages (seq),
  PRIMARY KEY (member_id, thread_id)
) STRICT, WITHOUT ROWID;
`;
