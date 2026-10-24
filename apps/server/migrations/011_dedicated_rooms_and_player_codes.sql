ALTER TABLE users ADD COLUMN recovery_hash text;

CREATE TABLE dedicated_rooms (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[1-9][0-9]{5}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
  manager_id uuid NOT NULL REFERENCES users(id),
  settings jsonb NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rooms ADD COLUMN dedicated_room_id uuid REFERENCES dedicated_rooms(id);
ALTER TABLE rooms ADD COLUMN password_hash text;
ALTER TABLE rooms DROP CONSTRAINT rooms_code_key;
CREATE UNIQUE INDEX rooms_active_code ON rooms(code) WHERE phase <> 'closed';
CREATE UNIQUE INDEX dedicated_room_active ON rooms(dedicated_room_id) WHERE phase <> 'closed';

CREATE TABLE player_code_reservations (
  code text PRIMARY KEY CHECK (code ~ '^[1-9][0-9]{5}$'),
  state text NOT NULL CHECK (state IN ('reserved','retired')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE player_code_audit (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  old_code text,
  new_code text NOT NULL,
  retained boolean NOT NULL,
  actor text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
