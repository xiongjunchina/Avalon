ALTER TABLE room_members DROP CONSTRAINT IF EXISTS room_members_seat_check;
ALTER TABLE room_members ADD CONSTRAINT room_members_seat_check CHECK (seat BETWEEN 1 AND 12);
UPDATE rooms SET code = LPAD((100000 + floor(random() * 900000)::int)::text, 6, '0') WHERE code !~ '^[0-9]{6}$';
