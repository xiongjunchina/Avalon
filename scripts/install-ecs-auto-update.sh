#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '安装失败：%s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail '请在 ECS 网页终端以 root 身份执行。'
for tool in git flock systemctl install; do
  command -v "$tool" >/dev/null || fail "未安装 $tool"
done
cd "${AVALON_DIR:-/opt/avalon}"
[[ -f deploy/.env.ecs ]] || fail '缺少 deploy/.env.ecs，请先完成 ECS 配置。'
[[ "$(git symbolic-ref --short HEAD)" == main ]] || fail '自动发布只允许安装在 main 分支。'
worktree_status="$(git status --porcelain)"
[[ -z "$worktree_status" ]] || fail '仓库存在未提交改动，请先处理。'
for script in scripts/update-ecs.sh scripts/ecs-launcher.sh; do bash -n "$script"; done

mkdir -p deploy/runtime
exec 9>deploy/runtime/update-ecs.lock
flock -n 9 || fail '已有发布正在运行，请在发布完成后重试安装。'
install -m 700 scripts/ecs-launcher.sh /root/update-avalon.sh
install -m 644 deploy/systemd/avalon-auto-update.service /etc/systemd/system/avalon-auto-update.service
install -m 644 deploy/systemd/avalon-auto-update.timer /etc/systemd/system/avalon-auto-update.timer
if command -v systemd-analyze >/dev/null; then
  systemd-analyze verify /etc/systemd/system/avalon-auto-update.service /etc/systemd/system/avalon-auto-update.timer
fi
systemctl daemon-reload
systemctl enable avalon-auto-update.timer
flock -u 9
systemctl restart avalon-auto-update.timer
systemctl list-timers --all avalon-auto-update.timer
printf '\n已启用：每小时 00、10、20、30、40、50 分检查 origin/main，有待发布版本时自动发布。\n'
printf '首次检查如无成功发布记录，会发布一次以建立记录。\n'
printf '查看日志：journalctl -u avalon-auto-update.service -n 80 --no-pager\n'
printf '停止定时检查：systemctl disable --now avalon-auto-update.timer\n'
