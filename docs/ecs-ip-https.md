# ECS 公网 IP HTTPS 入口

适用于已在 ECS 成功运行的 `avalon-ecs` 实例，切换入口至 `https://47.112.7.117`。不启动本地 Docker/ngrok，不改变 DNS。

阿里云说明：内地服务器上，通过 IP 访问的网站同样受备案要求约束；定向分享本身不等于获得豁免。技术配置不保证云平台不会拦截，具体开放条件应向备案接入方确认：
https://www.alibabacloud.com/help/en/icp-filing/basic-icp-service/product-overview/icp-filing-requirements-for-a-regular-website

## 入口配置

安全组需允许 TCP 80、443。已有 Caddy 镜像需为 2.10.2 或以上，本项目固定的部署版本为 2.11.4。使用独立 override，保留原数据库、数据库密码、镜像标签与证书卷，无需重新构建应用。

在 ECS 终端执行，先备份现有配置。此备份只创建一次；不打印数据库密码：

```bash
cd /opt/avalon
git pull --ff-only
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

依据：
- https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability
- https://caddyserver.com/docs/caddyfile/directives/tls
- https://github.com/caddyserver/caddy/issues/7399

## 验证边界

该 override 已静态解析检查端口覆盖、Secure Cookie 和 ACME profile；尚未在目标 ECS 上申请 IP 证书或验证公网连通性。用户提供服务器执行结果后再确认。
