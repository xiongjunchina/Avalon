# ECS 公网 IP HTTPS 入口

适用于已在 ECS 成功运行的 `avalon-ecs` 实例，切换入口至 `https://47.112.7.117`。不启动本地 Docker/ngrok，不改变 DNS。

阿里云说明：内地服务器上，通过 IP 访问的网站同样受备案要求约束；定向分享本身不等于获得豁免。技术配置不保证云平台不会拦截，具体开放条件应向备案接入方确认：
https://www.alibabacloud.com/help/en/icp-filing/basic-icp-service/product-overview/icp-filing-requirements-for-a-regular-website

## 入口配置

安全组需允许 TCP 80、443。已有 Caddy 镜像需为 2.10.2 或以上，本项目固定的部署版本为 2.11.4。使用独立 override，保留原数据库、数据库密码、镜像标签与证书卷，无需重新构建应用。

在 ECS 终端执行，先备份现有配置。此备份只创建一次；不打印数据库密码：

```bash
cd /opt/avalon
git pull --ipv4 --ff-only
if [ ! -f deploy/.env.ecs.before-ip ]; then cp -p deploy/.env.ecs deploy/.env.ecs.before-ip; fi
sed -i \
  -e 's|^APP_ORIGIN=.*|APP_ORIGIN=https://47.112.7.117|' \
  -e 's|^GATEWAY_PORT=.*|GATEWAY_PORT=443|' \
  -e 's|^COOKIE_SECURE=.*|COOKIE_SECURE=true|' \
  -e '/^PUBLIC_IP=/d' deploy/.env.ecs
printf '\nPUBLIC_IP=47.112.7.117\n' >> deploy/.env.ecs
chmod 600 deploy/.env.ecs
```

核对网关版本并切换服务：

```bash
docker compose --env-file deploy/.env.ecs -f deploy/compose.yaml exec -T gateway caddy version
docker compose --env-file deploy/.env.ecs -f deploy/compose.yaml -f deploy/compose.ip.example.yaml up -d --wait --wait-timeout 180
docker compose --env-file deploy/.env.ecs -f deploy/compose.yaml -f deploy/compose.ip.example.yaml logs --tail 40 gateway
```

这会替换原回环 8088 端口映射。Caddy 使用 Let's Encrypt 的 shortlived 配置申请公开可信 IP 证书并自动续期，有效期 160 小时；签发需要 CA 从公网验证 IP 的控制权。容器启动成功不代表证书已经签发，需从外部客户端确认：

```bash
curl --noproxy '*' --connect-timeout 10 --max-time 20 -fsS https://47.112.7.117/api/health
```

若证书申请失败，保留网关日志定位原因；不使用跳过证书校验的结果宣称可供手机正常使用，也不自动切换为自签证书或修改安全组。

## 回退

如需回到原 SSH 隧道测试入口，在 ECS 执行：

```bash
cd /opt/avalon
cp -p deploy/.env.ecs.before-ip deploy/.env.ecs
docker compose --env-file deploy/.env.ecs -f deploy/compose.yaml up -d --wait --wait-timeout 180
```

保持 `PROJECT=avalon-ecs`，不删除任何数据卷。回退时不再叠加 IP override。

## 后续域名切换

备案通过后，配置 DNS、将 `APP_ORIGIN` 改为正式 HTTPS 域名，改用 `compose.public.example.yaml` 作为 override，申请域名证书。原数据库保留，但浏览器不会将 IP 地址的访客 Cookie 自动迁移到域名，迁移前应说明账号恢复方式。

## 一键更新 GitHub 代码

仓库提供 [ECS 更新脚本](../scripts/update-ecs.sh)。在 ECS 终端执行一次安装；这里只拉取代码和安装文件，不启动发布：

```bash
cd /opt/avalon && git pull --ipv4 --ff-only && install -m 700 scripts/ecs-launcher.sh /root/update-avalon.sh
```

后续需要发布时执行：

```bash
/root/update-avalon.sh
```

脚本在 `/opt/avalon` 拉取当前分支，使用提交编号构建 `server` 和 `gateway`，构建成功后保存 `IMAGE_TAG`，启动容器并最多等待 180 秒。它根据 Compose 实际解析的 `APP_ORIGIN` 自动选择 IP 或域名 override：`https://47.112.7.117` 使用 `compose.ip.example.yaml`，`https://完整域名` 使用 `compose.public.example.yaml`。入口须为标准 HTTPS，不带端口或路径。

因此，备案后切换域名无需替换 `/root/update-avalon.sh`。完成 DNS 指向，并将 `deploy/.env.ecs` 中的 `APP_ORIGIN` 改为实际 HTTPS 域名后，保持 `COOKIE_SECURE=true`、`GATEWAY_PORT=443`、原 `PROJECT` 和数据库配置，再执行同一脚本即可。已有 `PUBLIC_IP` 可保留，域名模式不使用它。切换后需另外确认域名证书、公网 `/api/health`、网页和 WebSocket；容器健康等待不能证明公网证书或 DNS 已生效。

脚本拒绝并发发布和包含未提交改动的仓库；Git 拉取或镜像构建失败时不会启动新版容器。配置更新前会将上一份私密环境文件保存至 `deploy/runtime/.env.ecs.before-update`（权限 0600，仅保留最近一次）；这不是数据库备份。容器启动失败会返回非零退出码并保留错误，不会自动回退。发布会重建应用容器，宜在空闲时执行。

`/root/update-avalon.sh` 是固定入口，调用仓库内的更新脚本，后续拉取代码即可使用脚本的新版本。旧版直接复制完整脚本的用户需执行一次上方安装命令更换入口；普通代码发布和 IP 切换域名无需重新安装。此脚本仅用于已有 ECS 实例，不启动本机 Docker 或 ngrok。

脚本通过普通 `docker compose config` 的解析结果读取入口，不依赖 `config --environment`。若已安装的旧脚本提示 `unknown flag: --environment`，执行上方安装命令更新 `/root/update-avalon.sh` 后重试；仅拉取仓库不会替换 `/root` 中的脚本副本。

## 每 10 分钟检查并自动发布

在 ECS 网页终端以 root 身份安装并启用：

```bash
cd /opt/avalon && git pull --ipv4 --ff-only && bash scripts/install-ecs-auto-update.sh
```

安装器保留 `deploy/.env.ecs` 和已有发布记录，将固定入口放入 `/root/update-avalon.sh`，将 service／timer 安装到 `/etc/systemd/system`，校验配置并启用定时器。需要 Bash、Git、Docker Compose、flock 和运行中的 systemd；Git 访问须支持无人值守认证。安装器不会单独执行一次发布；定时器启动后按计划检查，若存在关机期间错过的检查，systemd 可能立即补跑一次。以后修改 service 或 timer 配置时，重新执行本节安装命令应用配置。

定时器在 ECS 本地时间每小时的 00、10、20、30、40、50 分检查 `origin/main`。自动检查只允许在干净的 `main` 分支上运行，先 fetch，再以快进方式更新到本次获取的确切提交；分支分叉或存在本地改动时停止并记录错误。发现待发布版本后执行构建和容器健康等待，无更新时不调用 Docker。自动和手动更新共用发布锁；已有发布在运行时，本次自动检查跳过，下一轮再检查。

手动 pull 与自动 fetch 均显式使用 `--ipv4`，与 ECS 上已成功的 `curl -4` 检查一样，选择 IPv4。GitHub 首页返回 HTTP 200 只证明该次网页请求可达，仍需以实际 Git 拉取结果确认仓库访问；网络故障时保留原成功记录，下轮再试。若 SSH 443 提示缺少已知主机密钥，表示尚未完成主机校验，不能据此认为 GitHub 仓库的 SSH 认证已通过。

成功记录保存在 `deploy/runtime/last-successful-deploy`，只有容器健康等待和状态查询均成功后才写入完整提交编号。构建或启动失败不更新成功记录；即使代码已经拉取，下次仍会重试。旧的 `IMAGE_TAG` 不是成功证明，因此首次检查没有成功记录时，会发布一次建立基线。手动执行 `/root/update-avalon.sh` 也会更新成功记录。无自动回退；启动失败可能已影响容器，应查看日志处理。单次自动运行最多 30 分钟，超时后同样不会推进成功记录。

查看下一次检查时间、日志，或立即检查一次：

```bash
systemctl list-timers --all avalon-auto-update.timer
journalctl -u avalon-auto-update.service -n 80 --no-pager
systemctl start avalon-auto-update.service
```

停止后续自动检查（不打断已开始的发布）：

```bash
systemctl disable --now avalon-auto-update.timer
```

恢复自动检查：

```bash
systemctl enable --now avalon-auto-update.timer
```

启用后，推送到 `main` 的代码会在后续检查中自动发布，可能导致正在游戏的玩家短暂断线并重连。安装和配置检查不代表已完成目标 ECS 的实际发布验收；需核对上述 timer、运行日志及发布后的公网入口。

依据：
- https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability
- https://caddyserver.com/docs/caddyfile/directives/tls
- https://github.com/caddyserver/caddy/issues/7399

## 验证边界

该 override 已静态解析检查端口覆盖、Secure Cookie 和 ACME profile；尚未在目标 ECS 上申请 IP 证书或验证公网连通性。用户提供服务器执行结果后再确认。
