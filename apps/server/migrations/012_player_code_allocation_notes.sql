-- Keep reservation notes in the durable assignment audit after a reserved code is consumed.
ALTER TABLE player_code_audit ADD COLUMN reservation_note text NOT NULL DEFAULT '';
CREATE INDEX player_code_audit_user_new_code ON player_code_audit(user_id,new_code,created_at DESC,id DESC);
CREATE INDEX player_code_audit_created ON player_code_audit(created_at DESC,id DESC);
