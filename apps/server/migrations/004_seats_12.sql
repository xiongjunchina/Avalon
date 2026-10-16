ALTER TABLE room_members DROP CONSTRAINT IF EXISTS room_members_seat_check;
ALTER TABLE room_members ADD CONSTRAINT room_members_seat_check CHECK (seat BETWEEN 1 AND 12);
