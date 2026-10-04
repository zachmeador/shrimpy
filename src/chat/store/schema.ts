/**
 * The tables' version. A store written by any other version is refused, never
 * changed. Version 3 is the first whose member IDs are the roster's: an ID in
 * an earlier store holds a name and means nothing to the gateway.
 */
export const SCHEMA_VERSION = 3;

/**
 * `messages.seq` is the server-wide order. AUTOINCREMENT keeps it from ever
 * being reused, so a cursor stays meaningful for the life of the store.
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
  direct_key TEXT UNIQUE
) STRICT;

CREATE TABLE memberships (
  channel_id TEXT NOT NULL REFERENCES channels (id),
  member_id TEXT NOT NULL REFERENCES members (id),
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

CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL REFERENCES channels (id),
  thread_id TEXT NOT NULL REFERENCES threads (id),
  author_id TEXT NOT NULL REFERENCES members (id),
  text TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  addressed TEXT NOT NULL
) STRICT;
CREATE INDEX messages_by_thread ON messages (thread_id, seq);

CREATE TABLE receipts (
  message_seq INTEGER NOT NULL REFERENCES messages (seq),
  member_id TEXT NOT NULL REFERENCES members (id),
  status TEXT NOT NULL CHECK (status IN ('answered', 'silent', 'stopped', 'skipped', 'failed')),
  reply_seq INTEGER REFERENCES messages (seq),
  detail TEXT,
  PRIMARY KEY (message_seq, member_id),
  CHECK ((status = 'answered') = (reply_seq IS NOT NULL)),
  CHECK ((status = 'failed') = (detail IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE posts (
  author_id TEXT NOT NULL REFERENCES members (id),
  request_id TEXT NOT NULL,
  message_seq INTEGER NOT NULL UNIQUE REFERENCES messages (seq),
  PRIMARY KEY (author_id, request_id)
) STRICT, WITHOUT ROWID;
`;
