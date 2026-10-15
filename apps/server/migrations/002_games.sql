ALTER TABLE rooms DROP CONSTRAINT rooms_phase_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_phase_check CHECK (phase IN ('waiting','playing','finished','closed'));
CREATE TABLE games (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id),
  ruleset_version text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE INDEX games_by_room ON games(room_id,created_at);
ALTER TABLE rooms ADD COLUMN current_game_id uuid REFERENCES games(id);
DROP INDEX rooms_cleanup;
CREATE INDEX rooms_cleanup ON rooms(offline_since) WHERE phase <> 'closed';
-- Game commands use fingerprints instead of retaining the submitted secret cards in receipts.
ALTER TABLE command_receipts ALTER COLUMN command_body DROP NOT NULL;
ALTER TABLE command_receipts ADD COLUMN command_fingerprint text;
ALTER TABLE command_receipts ADD CONSTRAINT receipt_command_present CHECK (command_body IS NOT NULL OR command_fingerprint IS NOT NULL);
