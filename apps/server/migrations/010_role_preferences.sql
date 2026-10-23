ALTER TABLE room_members ADD COLUMN IF NOT EXISTS role_preferences jsonb NOT NULL DEFAULT '[]'::jsonb;
