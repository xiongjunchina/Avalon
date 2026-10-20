-- 1. System global settings & feature flags (supports zero-friction cold start free mode)
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('free_access_mode', 'true'::jsonb),
  ('ad_reward_hours', '24'::jsonb),
  ('broadcast_announcement', '{"text": "", "enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. User memberships, ban status, and VIP expiry
CREATE TABLE IF NOT EXISTS user_memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_banned boolean NOT NULL DEFAULT false,
  banned_reason text,
  banned_at timestamptz,
  vip_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_memberships_banned ON user_memberships(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_user_memberships_vip ON user_memberships(vip_until) WHERE vip_until IS NOT NULL;

-- 3. Redemption codes for VIP / rewards
CREATE TABLE IF NOT EXISTS redemption_codes (
  code text PRIMARY KEY,
  days integer NOT NULL CHECK (days > 0),
  note text,
  redeemed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_redeemed ON redemption_codes(redeemed_at);
