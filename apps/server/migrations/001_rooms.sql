CREATE TABLE users (
  id uuid PRIMARY KEY,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  invite text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES users(id),
  settings jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  accepting_new_members boolean NOT NULL DEFAULT true,
  phase text NOT NULL DEFAULT 'waiting' CHECK (phase IN ('waiting','closed')),
  offline_since timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL,
  CHECK ((phase = 'closed') = (closed_at IS NOT NULL))
);
CREATE TABLE room_members (
  room_id uuid NOT NULL REFERENCES rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  seat integer NOT NULL CHECK (seat BETWEEN 1 AND 10),
  ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL,
  join_order bigserial NOT NULL,
  connection_id uuid,
  last_seen_at timestamptz NOT NULL,
  disconnected_at timestamptz,
  PRIMARY KEY (room_id,user_id),
  UNIQUE (room_id,seat),
  UNIQUE (user_id)
);
CREATE TABLE command_receipts (
  room_id uuid NOT NULL REFERENCES rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  command_id uuid NOT NULL,
  command_body jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id,user_id,command_id)
);
CREATE INDEX rooms_cleanup ON rooms(offline_since) WHERE phase = 'waiting';
CREATE INDEX rooms_closed ON rooms(closed_at) WHERE phase = 'closed';
