-- Run after stopping the new server and before starting a pre-moderation server:
-- psql -v ON_ERROR_STOP=1 -v public_base=https://game.ccnepower.com/avalon -f this-file.sql
-- Keeps approved image bytes usable by the old client/server without touching account identity.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL avalon_rollback.public_base = :'public_base';

DO $restore_avatars$
DECLARE
  base text := current_setting('avalon_rollback.public_base');
  prefix text;
  avatar_column text;
BEGIN
  IF base !~ '^https?://[^[:space:]?#]+[^/]$' THEN
    RAISE EXCEPTION 'public_base must be the public origin and optional game path, without a trailing slash';
  END IF;
  prefix := base || '/api/avatars/';

  -- Startup migration may have failed and rolled back before this table existed.
  IF to_regclass(format('%I.content_safety_images', current_schema())) IS NULL THEN
    RETURN;
  END IF;

  LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE content_safety_images IN SHARE MODE;

  -- Refuse a partial restore if a managed URL cannot be converted losslessly.
  -- Do not substitute a placeholder, clear a field, or silently discard unknown bytes.
  IF EXISTS (
    SELECT 1 FROM users u
    CROSS JOIN LATERAL (VALUES (u.avatar_url), (u.wechat_avatar_url)) AS avatar(url)
    LEFT JOIN content_safety_images i ON avatar.url = prefix || i.id
    WHERE left(avatar.url, length(prefix)) = prefix
      AND (i.id IS NULL OR NOT i.approved OR i.mime NOT IN ('image/png','image/jpeg','image/webp')
        OR octet_length(i.data) = 0
        OR length('data:' || i.mime || ';base64,' || translate(encode(i.data, 'base64'), E'\n\r', '')) > 65536)
  ) THEN
    RAISE EXCEPTION 'Managed avatar cannot be restored safely; no user avatar was changed';
  END IF;

  -- Separate updates also handle one user whose two avatar fields reference different images.
  FOREACH avatar_column IN ARRAY ARRAY['avatar_url', 'wechat_avatar_url'] LOOP
    EXECUTE format(
      'UPDATE users u SET %1$I = ''data:'' || i.mime || '';base64,'' || translate(encode(i.data, ''base64''), E''\n\r'', '''')
       FROM content_safety_images i WHERE i.approved AND u.%1$I = $1 || i.id',
      avatar_column
    ) USING prefix;
  END LOOP;
END
$restore_avatars$;

COMMIT;
