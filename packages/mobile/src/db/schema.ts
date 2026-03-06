// SQLite schema for the local op log replica.
// All CREATE statements use IF NOT EXISTS — safe to run on every app start.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS talkgroups (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  master_secret    TEXT NOT NULL,
  rotation_counter INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id      TEXT NOT NULL,
  talkgroup_id TEXT NOT NULL,
  site         TEXT NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (user_id, talkgroup_id)
);

CREATE TABLE IF NOT EXISTS ops (
  seq        INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  issued_by  TEXT NOT NULL,
  issued_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_cursor (
  id       INTEGER PRIMARY KEY DEFAULT 1,
  last_seq INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sync_cursor (id, last_seq) VALUES (1, 0);
`;
