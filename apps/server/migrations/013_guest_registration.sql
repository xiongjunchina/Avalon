-- An unpredictable client request id makes first registration safe to retry.
-- Keep it private; account identity remains the user id, never the nickname.
ALTER TABLE users ADD COLUMN guest_registration_id uuid UNIQUE;
