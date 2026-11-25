-- The chat store as Shrimpy 1.0.0 wrote it, at version 10, made by 1.0.0's own chat operations and dumped as SQL.
-- zach (a person), scout and crab (agents). zach's DM with scout talks in its main thread, with a receipt, a
-- reaction and zach's read mark, and has a side thread "deploys". zach's DM with crab never used its main thread
-- and talks in a thread zach started. scout's DM with crab has a main thread with a name, "plans", and nothing in
-- it. The room "ops" talks in its main thread and a side thread "incidents", and the room "quiet" has said nothing.
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
INSERT INTO store (id) VALUES ('store_3vfrbchdg8yw');
INSERT INTO members (id, kind, name) VALUES ('mem_zach', 'person', 'zach');
INSERT INTO members (id, kind, name) VALUES ('mem_scout', 'agent', 'scout');
INSERT INTO members (id, kind, name) VALUES ('mem_crab', 'agent', 'crab');
INSERT INTO channels (id, kind, name, direct_key, room_key) VALUES ('ch_1x64d1p8bhhz', 'dm', NULL, '["mem_scout","mem_zach"]', NULL);
INSERT INTO channels (id, kind, name, direct_key, room_key) VALUES ('ch_qbpjwhkjz141', 'dm', NULL, '["mem_crab","mem_zach"]', NULL);
INSERT INTO channels (id, kind, name, direct_key, room_key) VALUES ('ch_cwrbqdenpse0', 'dm', NULL, '["mem_crab","mem_scout"]', NULL);
INSERT INTO channels (id, kind, name, direct_key, room_key) VALUES ('ch_1f1h2azqpye4', 'room', 'ops', NULL, 'ops');
INSERT INTO channels (id, kind, name, direct_key, room_key) VALUES ('ch_61vfjrka8kea', 'room', 'quiet', NULL, 'quiet');
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_1f1h2azqpye4', 'mem_crab', 6);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_1f1h2azqpye4', 'mem_scout', 6);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_1f1h2azqpye4', 'mem_zach', 6);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_1x64d1p8bhhz', 'mem_scout', 0);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_1x64d1p8bhhz', 'mem_zach', 0);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_61vfjrka8kea', 'mem_scout', 9);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_61vfjrka8kea', 'mem_zach', 9);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_cwrbqdenpse0', 'mem_crab', 6);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_cwrbqdenpse0', 'mem_scout', 6);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_qbpjwhkjz141', 'mem_crab', 5);
INSERT INTO memberships (channel_id, member_id, since_seq) VALUES ('ch_qbpjwhkjz141', 'mem_zach', 5);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_fhpxckk4bbcp', 'ch_1x64d1p8bhhz', 1, NULL, 0, 0, 'How full is the disk?', 2, 2, 1764000180000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_9x8pf3k7q48q', 'ch_1x64d1p8bhhz', 0, 'deploys', 0, 0, 'Ship it after lunch.', 1, 5, 1764000420000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_df6rw9016wrv', 'ch_qbpjwhkjz141', 1, NULL, 0, 0, NULL, 0, 0, 1764000480000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_tawec9p5g8m1', 'ch_qbpjwhkjz141', 0, NULL, 0, 0, 'Are the pots set?', 1, 6, 1764000600000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_nk4zqarec11k', 'ch_cwrbqdenpse0', 1, 'plans', 0, 1, NULL, 0, 0, 1764000660000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_0rasjp0craer', 'ch_1f1h2azqpye4', 1, NULL, 0, 0, '@scout can you watch the deploy?', 2, 8, 1764000840000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_52faedzj3nax', 'ch_1f1h2azqpye4', 0, 'incidents', 0, 0, 'None today.', 1, 9, 1764000960000);
INSERT INTO threads (id, channel_id, main, name, archived, revision, preview, message_count, last_seq, updated_at) VALUES ('th_c66rq4xq530x', 'ch_61vfjrka8kea', 1, NULL, 0, 0, NULL, 0, 0, 1764001020000);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (1, 'evt_92ayj6nnt4mq', 'posted', 'ch_1x64d1p8bhhz', NULL, 'mem_zach', 1764000120000, 'How full is the disk?', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (2, 'evt_vpw7jbyx2p5b', 'posted', 'ch_1x64d1p8bhhz', NULL, 'mem_scout', 1764000180000, '91%, mostly old logs.', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (3, 'evt_abedgk8sy774', 'receipted', 'ch_1x64d1p8bhhz', 1, 'mem_scout', 1764000240000, NULL, NULL, NULL, 1, 'answered', 2, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (4, 'evt_2j87jm82tfq9', 'reacted', 'ch_1x64d1p8bhhz', 2, 'mem_zach', 1764000300000, NULL, NULL, '👍', NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (5, 'evt_pr7ns9nkjp9e', 'posted', 'ch_1x64d1p8bhhz', NULL, 'mem_zach', 1764000420000, 'Ship it after lunch.', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (6, 'evt_2t46w98wrtya', 'posted', 'ch_qbpjwhkjz141', NULL, 'mem_zach', 1764000600000, 'Are the pots set?', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (7, 'evt_hfc1gma5sgxq', 'posted', 'ch_1f1h2azqpye4', NULL, 'mem_zach', 1764000780000, '@scout can you watch the deploy?', '["mem_scout"]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (8, 'evt_4qe9ba7n70da', 'posted', 'ch_1f1h2azqpye4', NULL, 'mem_scout', 1764000840000, 'Watching.', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO events (seq, id, kind, channel_id, target_seq, actor_id, at, text, mentions, emoji, answers_seq, status, reply_seq, detail) VALUES (9, 'evt_fwkjcb1h90h1', 'posted', 'ch_1f1h2azqpye4', NULL, 'mem_scout', 1764000960000, 'None today.', '[]', NULL, NULL, NULL, NULL, NULL);
INSERT INTO sqlite_sequence (name, seq) VALUES ('events', 9);
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (1, 'msg_090g7sdgdc92', 'ch_1x64d1p8bhhz', 'th_fhpxckk4bbcp', 'mem_zach', 'How full is the disk?', 'How full is the disk?', 1764000120000, NULL, 0, '[]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (2, 'msg_ffqkd44ws7tc', 'ch_1x64d1p8bhhz', 'th_fhpxckk4bbcp', 'mem_scout', '91%, mostly old logs.', '91%, mostly old logs.', 1764000180000, NULL, 0, '[]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (5, 'msg_7dg8e6byzebn', 'ch_1x64d1p8bhhz', 'th_9x8pf3k7q48q', 'mem_zach', 'Ship it after lunch.', 'Ship it after lunch.', 1764000420000, NULL, 0, '[]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (6, 'msg_0tjbf38p2je6', 'ch_qbpjwhkjz141', 'th_tawec9p5g8m1', 'mem_zach', 'Are the pots set?', 'Are the pots set?', 1764000600000, NULL, 0, '[]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (7, 'msg_72cbkvm67xfg', 'ch_1f1h2azqpye4', 'th_0rasjp0craer', 'mem_zach', '@scout can you watch the deploy?', '@scout can you watch the deploy?', 1764000780000, NULL, 0, '["mem_scout"]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (8, 'msg_v51y0peetrzc', 'ch_1f1h2azqpye4', 'th_0rasjp0craer', 'mem_scout', 'Watching.', 'Watching.', 1764000840000, NULL, 0, '[]');
INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, edited_at, deleted, mentions) VALUES (9, 'msg_xrz1sgqq0geh', 'ch_1f1h2azqpye4', 'th_52faedzj3nax', 'mem_scout', 'None today.', 'None today.', 1764000960000, NULL, 0, '[]');
INSERT INTO reactions (message_seq, member_id, emoji, event_seq) VALUES (2, 'mem_zach', '👍', 4);
INSERT INTO receipts (event_seq, member_id, status, reply_seq, detail) VALUES (1, 'mem_scout', 'answered', 2, NULL);
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_scout', 'req-2', 2, '2e97f5353e9ef1d1af6ad511068c469d3c1e4401ec893aabbbd3b47bfd1a723d');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_scout', 'req-7', 8, '4b9fb1e6b72fc65807a210c25f6283ea2ac4e50fc15d2123cd59bf27de2d34e6');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_scout', 'req-8', 9, '99fe12c00842d93c90b7bd9130cc62b8c75362c642b44ff65e47de72316e3cf4');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_zach', 'req-1', 1, '3960d847c483b4d830bb3a3cad0f910f982b1c06bdc8457f93448bc4f9828bbe');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_zach', 'req-3', 2, '0c757e0797e3a5fc17553764e1810833cac93190c30f95afecf1680693c9a6b7');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_zach', 'req-4', 5, 'a79133f871e65e81b62cc6217f995f481921f5ce5a9c7ab06ee1fe6fa22e74a7');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_zach', 'req-5', 6, '1939d9e9d50a8f2b3590f8e695af28c2a0b628a9d7e66bd01e98f444e6a2fae8');
INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES ('mem_zach', 'req-6', 7, 'bc59d0ac0f8864f31832ca09031507c344c0a59f57dcf7ce9b6e7609e605fbda');
INSERT INTO read_marks (member_id, thread_id, message_seq) VALUES ('mem_zach', 'th_fhpxckk4bbcp', 2);
INSERT INTO sqlite_sequence (name, seq) VALUES ('events', 9);
PRAGMA user_version = 10;
