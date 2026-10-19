ALTER TABLE users ADD COLUMN IF NOT EXISTS player_code text UNIQUE;

UPDATE users
  SET player_code = LPAD((abs(hashtext(id::text)) % 900000 + 100000)::text, 6, '0')
  WHERE player_code IS NULL;

CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS friends_user_idx ON friends(user_id);
CREATE INDEX IF NOT EXISTS friends_friend_idx ON friends(friend_id);
