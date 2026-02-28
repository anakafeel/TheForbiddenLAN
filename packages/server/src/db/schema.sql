-- Run this in Supabase SQL editor to set up the database

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
  role TEXT NOT NULL DEFAULT 'operator',
  device_id UUID REFERENCES devices(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE talkgroups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  master_secret BYTEA NOT NULL,
  rotation_counter INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE memberships (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  talkgroup_id UUID REFERENCES talkgroups(id) ON DELETE CASCADE,
  site TEXT,
  PRIMARY KEY (user_id, talkgroup_id)
);

CREATE TABLE key_rotations (
  talkgroup_id UUID REFERENCES talkgroups(id) ON DELETE CASCADE,
  counter INT NOT NULL,
  rotated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gps_updates (
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  alt FLOAT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (device_id)
);

-- Function for atomic counter increment (used by key rotation)
CREATE OR REPLACE FUNCTION increment_rotation_counter(tg_id UUID)
RETURNS INT AS $$
  UPDATE talkgroups
  SET rotation_counter = rotation_counter + 1
  WHERE id = tg_id
  RETURNING rotation_counter;
$$ LANGUAGE SQL;
