#!/usr/bin/env bash
# Manual: no arguments. Scheduled checks: --if-changed (origin/main only).
set -euo pipefail
umask 077

fail() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

env_tmp=''
state_tmp=''
published=false
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )) && "$published"; then
    printf '更新失败，恢复上一版 Avalon 配置和镜像……\n' >&2
    cp -p deploy/runtime/.env.ecs.before-update "$env_file"
    unset IMAGE_TAG
    dc up -d --no-deps --no-build --wait --wait-timeout 180 server gateway || printf '自动回退失败，请检查 Avalon 容器。\n' >&2
  fi
  if [[ -n "$env_tmp" ]]; then rm -f -- "$env_tmp" || true; fi
  if [[ -n "$state_tmp" ]]; then rm -f -- "$state_tmp" || true; fi
  if (( status != 0 )); then
    printf '发布未完成（退出码 %s）。请查看上方错误，修复后重试。\n' "$status" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

automatic=false
case "${1:-}" in
  '') [[ $# -eq 0 ]] || fail '用法：update-avalon.sh [--if-changed]' ;;
  --if-changed) [[ $# -eq 1 ]] || fail '用法：update-avalon.sh [--if-changed]'; automatic=true ;;
  *) fail '用法：update-avalon.sh [--if-changed]' ;;
esac

cd "${AVALON_DIR:-/opt/avalon}"
env_file=deploy/.env.ecs
[[ -f "$env_file" ]] || fail "缺少 $PWD/$env_file"
for tool in git docker flock; do
  command -v "$tool" >/dev/null || fail "未安装 $tool"
done

# The lock is released by the OS even if the process exits unexpectedly.
mkdir -p deploy/runtime
exec 9>deploy/runtime/update-ecs.lock
if ! flock -n 9; then
  if "$automatic"; then printf '已有发布正在运行，本次检查跳过。\n'; exit 0; fi
  fail '已有发布脚本正在运行，请等待其结束。'
fi
worktree_status="$(git status --porcelain)"
[[ -z "$worktree_status" ]] || fail '仓库存在未提交改动，请先处理，脚本不会覆盖。'

state_file=deploy/runtime/last-successful-deploy
if "$automatic"; then
  [[ "$(git symbolic-ref --short HEAD)" == main ]] || fail '自动发布只允许在 main 分支运行。'
  export GIT_TERMINAL_PROMPT=0
  printf '检查 origin/main 是否有新版本……\n'
  git fetch --ipv4 --no-tags origin main
  target_revision="$(git rev-parse FETCH_HEAD)"
  current_revision="$(git rev-parse HEAD)"
  git merge-base --is-ancestor "$current_revision" "$target_revision" || fail '本地 main 与远端不满足快进条件，请人工检查。'
  deployed_revision=''
  if [[ -f "$state_file" ]]; then deployed_revision="$(cat "$state_file")"; fi
  if [[ "$target_revision" == "$deployed_revision" && "$current_revision" == "$target_revision" ]]; then
    printf '没有待发布的新版本，本次检查结束。\n'
    exit 0
  fi
  git merge --ff-only "$target_revision"
else
  printf '拉取当前分支代码……\n'
  git pull --ipv4 --ff-only
fi
revision="$(git rev-parse HEAD)"
if "$automatic" && [[ -n "$deployed_revision" ]]; then
  changed_files="$(git diff --name-only "$deployed_revision" "$revision")"
  portal_only=true
  [[ -n "$changed_files" ]] || portal_only=false
  while IFS= read -r changed; do
    case "$changed" in deploy/portal/*|docs/game-portal.md) ;; *) portal_only=false ;; esac
  done <<< "$changed_files"
  if "$portal_only"; then
    printf '仅公共入口配置发生变化，Avalon 无需重新部署；保留实际部署版本记录。\n'
    exit 0
  fi
fi
IMAGE_TAG="$(git rev-parse --short HEAD)"
export IMAGE_TAG

base_dc() {
  docker compose --env-file "$env_file" -f deploy/compose.yaml "$@"
}

# Read the resolved YAML using the basic config command for Compose compatibility.
# Consume the whole stream; only the first APP_ORIGIN reaches the script output.
app_origin="$(base_dc config | awk '
  $1 == "APP_ORIGIN:" && !found {
    sub(/^[[:space:]]*APP_ORIGIN:[[:space:]]*/, "")
    sub(/[[:space:]]*$/, "")
    print
    found = 1
  }
')"
case "$app_origin" in
  \"*\") app_origin="${app_origin#\"}"; app_origin="${app_origin%\"}" ;;
  \'*\') app_origin="${app_origin#\'}"; app_origin="${app_origin%\'}" ;;
esac
if [[ "$app_origin" =~ ^https://([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  IFS=. read -r -a octets <<< "${app_origin#https://}"
  for octet in "${octets[@]}"; do
    (( 10#$octet <= 255 )) || fail 'APP_ORIGIN 中的 IPv4 地址无效。'
  done
  override=deploy/compose.ip.example.yaml
  mode='IP HTTPS'
elif [[ "$app_origin" =~ ^https://([[:alnum:]]([[:alnum:]-]*[[:alnum:]])?\.)+[[:alpha:]]([[:alnum:]-]*[[:alnum:]])?$ ]]; then
  override=deploy/compose.public.example.yaml
  mode='域名 HTTPS'
else
  fail 'APP_ORIGIN 必须是 https://公网IPv4 或 https://完整域名，不带路径或端口。'
fi

# Keep the optional, locally approved Mafia ingress overlay on future releases.
env_value() { awk -F= -v key="$1" '$1==key {value=substr($0,index($0,"=")+1)} END {print value}' "$env_file"; }
portal_mode=false
mafia_overlay=deploy/runtime/compose.mafia.yaml
if [[ "$(env_value PUBLIC_INGRESS_MODE)" == portal ]]; then
  [[ "$(env_value APP_BASE_PATH)" == /avalon/ ]] || fail '公共入口模式要求 APP_BASE_PATH=/avalon/。'
  portal_mode=true
  override=deploy/compose.portal.yaml
  mode='独立公共入口'
elif [[ -f "$mafia_overlay" ]]; then
  sha256sum --check deploy/runtime/mafia-caddy-source.sha256 >/dev/null || fail '共享入口的 Caddy 基线已变化，请先同步 Mafia 路由配置。'
fi
dc() {
  if ! "$portal_mode" && [[ -f "$mafia_overlay" ]]; then
    base_dc -f "$override" -f "$mafia_overlay" "$@"
  else
    base_dc -f "$override" "$@"
  fi
}

dc config --quiet
printf '发布版本：%s；入口：%s（%s）\n' "$IMAGE_TAG" "$app_origin" "$mode"
dc build server gateway

# Persist the new tag only after both images have built successfully.
# Keep the previous private configuration and replace the env file atomically.
cp -p "$env_file" deploy/runtime/.env.ecs.before-update
chmod 600 deploy/runtime/.env.ecs.before-update
env_tmp="$(mktemp "${env_file}.tmp.XXXXXX")"
awk '!/^[[:space:]]*(export[[:space:]]+)?IMAGE_TAG[[:space:]]*=/' "$env_file" > "$env_tmp"
printf '\nIMAGE_TAG=%s\n' "$IMAGE_TAG" >> "$env_tmp"
chmod 600 "$env_tmp"
mv -f -- "$env_tmp" "$env_file"
env_tmp=''

published=true
if "$portal_mode"; then
  dc up -d --no-deps --wait --wait-timeout 180 server gateway
  curl -fsS --noproxy '*' --resolve "${app_origin#https://}:443:127.0.0.1" --connect-timeout 5 --max-time 15 "$app_origin/avalon/api/health" > deploy/runtime/avalon-health.json
  python3 -c 'import json; assert json.load(open("deploy/runtime/avalon-health.json"))["status"] == "ok"'
else
  dc up -d --wait --wait-timeout 180
fi
dc ps
state_tmp="$(mktemp "${state_file}.tmp.XXXXXX")"
printf '%s\n' "$revision" > "$state_tmp"
chmod 600 "$state_tmp"
mv -f -- "$state_tmp" "$state_file"
state_tmp=''
published=false
printf '\n容器更新及健康等待已完成：%s\n访问地址：%s\n' "$IMAGE_TAG" "$app_origin"
