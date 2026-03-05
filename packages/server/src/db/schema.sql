-- ForbiddenLAN server schema (distributed architecture)
-- The server stores auth, devices, GPS, operation log, and sync cursors.
-- App-level entities (talkgroups, memberships, keys) live on each device's local SQLite.

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  site TEXT NOT NULL,
  serial TEXT UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  public_key TEXT,
  device_id UUID UNIQUE REFERENCES devices(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gps_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  alt DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Append-only operation log. Every admin action is a row.
CREATE TABLE operations (
  seq SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  issued_by UUID NOT NULL,
  signature TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now()
);

-- Per-user sync cursor (what ops each client has acknowledged)
CREATE TABLE sync_cursors (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  last_seq INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ
);
