-- Additive only: existing users, messages, games and volumes are preserved.
ALTER TABLE sessions ADD COLUMN wechat_actor_openid text;
ALTER TABLE sessions ADD COLUMN wechat_actor_verified_at timestamptz;

CREATE TABLE content_safety_checks (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('profile','chat','image')),
  content_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('pass','risky','review','error')),
  provider text NOT NULL,
  trace_id text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_safety_checks_lookup ON content_safety_checks(kind,content_hash,created_at DESC);

CREATE TABLE content_safety_reviews (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('profile','chat','image')),
  content_hash text NOT NULL,
  content text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','risky')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  note text
);
CREATE UNIQUE INDEX content_safety_reviews_pending ON content_safety_reviews(kind,content_hash) WHERE status='pending';

CREATE TABLE content_safety_images (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  data bytea NOT NULL CHECK (octet_length(data)<=49134),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content_safety_media_tickets (
  token_hash text PRIMARY KEY,
  image_id text NOT NULL REFERENCES content_safety_images(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
