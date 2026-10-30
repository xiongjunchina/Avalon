# 独立游戏门户与 ECS 路径迁移

本方案的目标是根域名显示游戏大厅，每款游戏使用独立路径。运行时公共入口独立于 Avalon、Mafia；源码暂随 Avalon 仓库管理。是否已上线，应以目标 ECS 的 `state.json`、容器状态和外部 HTTPS 验收为准。

| 地址 | 行为 |
| --- | --- |
| `/` | 两款游戏的选择页 |
| `/avalon` | 308 跳转至 `/avalon/`，保留查询参数 |
| `/avalon/` | Avalon 网页、资源与管理入口 |
| `/avalon/api/...` | Avalon API、房间 WebSocket |
| `/mafia/`、`/mafia/api/...` | Mafia 既有网页及接口 |
| `/healthz` | 公共入口存活检查；不代表游戏数据库健康 |

## 结构与配置

- `deploy/portal/games.json` 是游戏登记表；生成器从同一表生成大厅、路由和入口的 Compose 网络连接。
- `game-portal` 是独立 Compose 项目，仅发布 80/443；各游戏提供内部入口，数据库保留于原私有网络。
- 公共入口产物位于 `/opt/game-portal/public/<版本>/`，`public/current` 原子切换版本。该目录仅包含可公开的网页与入口配置；私有 `.env`、数据库备份不挂载进公共网关。
- 网关继续使用原有的 Caddy 证书卷和配置卷。迁移脚本通过 `docker inspect` 读取真实卷名，不创建替代数据库卷，也不删除任何旧卷。
- Avalon 增加 `APP_BASE_PATH=/avalon/`、`PUBLIC_INGRESS_MODE=portal`。`APP_ORIGIN` 仍是 `https://game.ccnepower.com`，不能追加路径。
- Avalon 镜像在构建时固化路径；网关启动时核对路径清单。公共入口保留前缀，Avalon 内部网关剥除一次 `/avalon`；Mafia 继续按原有方式处理 `/mafia/`。

大厅不实现统一账号。已有 Cookie、浏览器账号记录、仙友码和战绩沿用。旧根地址携带 `invite`、`admin`、`page=admin` 或管理片段时由大厅脚本导向 Avalon，并保留参数及片段；旧 `/admin`、`/api`、`/assets`、`/art`、`/audio` 继续兼容。旧 API 使用代理而不是重定向，保留 POST 请求体和 WebSocket 握手。未知游戏路径返回 404。

## 开发验证

```sh
node deploy/portal/generate.mjs
APP_BASE_PATH=/avalon/ npm run build
node --import tsx --test apps/web/test/deployment.test.ts apps/web/test/avatar-catalog.test.ts
node --test scripts/deploy/portal-runtime.test.mjs scripts/deploy/update-ecs.test.mjs
CADDY_BIN=/path/to/caddy node --test scripts/deploy/portal.test.mjs
npm run package:minigame -- --version=0.2.0
```

真实 Caddy 测试使用临时回环地址验证两层转发、POST、WebSocket、前缀剥除、静态资源和 404，不需要本地 Docker/ngrok。`CADDY_BIN` 未设置时只运行登记表与旧邀请链接测试；不得把该跳过状态当作网关联调通过。

## 第一次 ECS 迁移

迁移前必须从 ECS 外部验证正式域名证书及两个旧健康接口。ECS 自身访问正常不证明阿里云已在公网放行。若仍有备案 403 或 TLS 重置，先保留工作分支，不合入 `main` 或修改生产入口。

1. 在工作分支完成源码、检查与微信候选包。保留所有已部署镜像和旧配置。
2. 发布者记录两个定时器原状态并暂停，然后将已验证的提交合入 `main`。暂停前确认两个更新服务未在执行；不要在进行中对局期间切换。
3. ECS 在 `/opt/avalon` 快进拉取 `main`，确认工作区干净。迁移脚本会再次取得 Avalon、Mafia 的发布锁，并保存其启动时的定时器状态。
4. 在 ECS 执行：

```sh
cd /opt/avalon
python3 deploy/portal/runtime.py migrate --public-ready
```

`--public-ready` 表示发布者已完成前述外部 HTTPS 检查，并非跳过证书验证。脚本依次执行双库 `pg_dump -Fc` 和目录校验、私有配置备份、入口生成与 Caddy 校验、Avalon 镜像构建、再次确认无进行中对局、端口切换及 HTTPS 健康检查。只重建 Avalon 应用和内部网关，不启动或重建数据库、Mafia 应用及 Mafia 内部网关。

5. 检查 `/opt/game-portal/state.json`、备份目录中的保护容器前后记录及两个网页入口。使用专用测试账号验证邀请、刷新、管理入口、断线重连和网页语音，不删除现有用户或战绩。
6. 恢复发布者在第 2 步暂停前处于 active 的定时器。迁移脚本会恢复其**调用时**的状态；外层提前暂停的任务需要外层恢复。确认下一次定时检查和服务结果正常。

```sh
systemctl start avalon-auto-update.timer mafia-auto-update.timer
systemctl list-timers --all avalon-auto-update.timer mafia-auto-update.timer
systemctl show avalon-auto-update.service mafia-auto-update.service -p Result -p ExecMainStatus
```

首次切换失败会停止新公共入口，恢复之前的 Avalon 私有配置、镜像和旧共享入口。双库及旧卷不删除；备份在 `/opt/game-portal/backups/<时间>/`。遇到强制断电等无法执行回退的情况，使用该目录的 `avalon.env.before` 和原 Compose 文件恢复旧入口，再恢复定时器；不要执行 `down -v`。

## 后续独立发布

Avalon 仍使用 `/root/update-avalon.sh` 或原有定时任务；门户模式只更新 Avalon `server gateway`。新增的公共入口专用提交不重建 Avalon，并保留实际部署提交记录。Mafia 继续使用原发布流程，旧 Avalon 健康接口保持兼容。

公共入口发布与回滚：

```sh
cd /opt/avalon
python3 deploy/portal/runtime.py release
python3 deploy/portal/runtime.py rollback
```

两条命令都使用独立入口状态、发布锁、健康检查及失败回退；不操作游戏容器。未改变网络和镜像时，公共入口通过 Caddy reload 载入新路由，游戏长连接配置延迟关闭，客户端仍需支持断线恢复。添加网络或更换网关镜像时应安排维护窗口。

## 接入第三款游戏

1. 为游戏选定唯一小写标识，提供 `/<标识>/` 的网页、资源及 `/<标识>/api/` 接口；前缀只在它自己的内部入口处理一次。
2. 独立部署应用和数据库，仅将内部 HTTP 网关加入专属 ingress 网络；不开放新公网应用/数据库端口。
3. 在登记表增加名称、简介、人数、入口、内部上游、网络及健康检查地址。健康接口返回 JSON `status: "ok"` 或 `ok: true`。
4. 运行生成和路由验证，独立发布公共入口。检查新游戏完整流程及原两款游戏，不更改它们的业务代码。
5. 新增网页游戏不自动产生微信客户端。本轮只发布 Avalon；Mafia 及其他游戏日后分别决定微信接入。
