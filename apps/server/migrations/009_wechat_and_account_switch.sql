-- 009: WeChat OpenID Support & Account Switching Indices
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_unionid text;

CREATE INDEX IF NOT EXISTS users_wechat_openid_idx ON users(wechat_openid);
CREATE INDEX IF NOT EXISTS users_player_code_idx ON users(player_code);
