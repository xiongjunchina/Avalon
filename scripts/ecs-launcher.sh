#!/usr/bin/env bash
set -euo pipefail
exec bash "${AVALON_DIR:-/opt/avalon}/scripts/update-ecs.sh" "$@"
