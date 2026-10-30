#!/bin/sh
set -eu
compiled=$(cat /srv/base-path.txt)
APP_BASE_PATH=${APP_BASE_PATH:-/}
if [ "$APP_BASE_PATH" != / ]; then APP_BASE_PATH=${APP_BASE_PATH%/}/; fi
export APP_BASE_PATH
[ "$APP_BASE_PATH" = "$compiled" ] || {
  echo 'APP_BASE_PATH differs from the frontend build; rebuild with the same path.' >&2
  exit 1
}
exec "$@"
