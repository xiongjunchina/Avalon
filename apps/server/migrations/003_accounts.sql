ALTER TABLE users ADD COLUMN avatar text NOT NULL DEFAULT 'leaf'
  CHECK (avatar IN ('leaf','moon','sun','mountain','wave','star'));

-- Membership in a historical game survives leaving/closing the room.
CREATE TABLE game_participants (
  game_id uuid NOT NULL REFERENCES games(id),
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (game_id,user_id)
);
INSERT INTO game_participants(game_id,user_id)
  SELECT g.id,(p->>'id')::uuid FROM games g,
  LATERAL jsonb_array_elements(g.state->'players') p;
CREATE INDEX games_by_participant ON game_participants(user_id,game_id);
CREATE INDEX games_ended_order ON games(ended_at DESC,id DESC) WHERE ended_at IS NOT NULL;
CREATE TABLE favorites (
  user_id uuid NOT NULL,
  game_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,game_id),
  FOREIGN KEY (game_id,user_id) REFERENCES game_participants(game_id,user_id)
);
CREATE TABLE setting_presets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 24),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (user_id,name)
);
