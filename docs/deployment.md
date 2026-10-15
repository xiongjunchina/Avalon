# 本地部署、备份与恢复

第七阶段交付为可运行的独立 H5 部署包。2026-09-30 按用户选定顺序，新增本机 Docker + ngrok HTTPS 朋友内测入口，详见[朋友内测指南](friends-test.md)。未购买 ECS、未修改已有域名 DNS；iPhone／Android 微信验收仍需朋友完成。本篇 `127.0.0.1` 地址仅供本机访问，不能作为朋友邀请地址。

## 运行结构

浏览器 → Caddy（网页、同源 `/api`、WebSocket、TLS）→ 单个 Node 后端 → PostgreSQL。

网页使用 Vite 生成的静态包；后端通过 TypeScript 编译为 JavaScript，运行 `node apps/server/src/index.js`，不依赖开发服务器或 tsx。构建时 `npm ci` 使用锁文件；镜像固定 Node 24.19.0、Caddy 2.11.4、PostgreSQL 18.4 对应的 digest。运行时后端以非 root 身份、只读根文件系统启动，数据库和证书保存在各实例独立卷中。

仅 Caddy 映射主机端口，且本地配置强制绑定 `127.0.0.1`；数据库和后端没有主机映射。后端只信任最近的一跳代理，普通配置的 Caddy 覆盖客户端的 X-Forwarded-For 并移除 Forwarded；ngrok专用叠加配置保留其附加真实客户端IP的链，详细边界见内测指南。不要把后端直接暴露给其他客户端。私密 API 禁止缓存，网页禁止被嵌入，静态资源使用同源 CSP。网关不启用访问日志，不将邀请或会话写入访问日志。

默认开发项目 `avalon`、开发端口5173／3001／55433保持独立。部署实例统一为 `avalon-stage7-<名字>`；脚本拒绝不匹配的项目名。默认只接受回环 Origin；显式 EXPOSURE=ngrok 的实例只接受经过校验的 ngrok HTTPS Origin 和 Secure Cookie，仍只绑定本机端口。

## 本机启动与停止

需要 Docker Compose 2.24.4+ 和 Node 22.12+，以下命令均在项目根目录运行：

```sh
npm ci
npm run deploy:setup -- local http 8088
npm run deploy -- local build
npm run deploy -- local up
npm run deploy -- local status
```

打开 `http://127.0.0.1:8088/`。不要换成 localhost，否则 Origin 不同。该入口与开发版 localhost 使用不同浏览器身份；Cookie 不按端口隔离，同一个主机名的多个部署实例不能当作独立浏览器身份使用。多玩家仍需独立浏览器会话。

`deploy:setup` 创建权限0600的 `deploy/.env.local`，密码随机生成且不打印；文件已存在时完整保留。密码、项目名和卷彼此关联，直接改密码不能改变已初始化数据库账号的密码。`.dockerignore` 排除私密配置、备份、CA和证据目录，镜像中没有本机 `.env`。

```sh
npm run deploy -- local restart  # 只重启后端，房间和对局恢复
npm run deploy -- local stop     # 停止全部服务，保留数据库卷
npm run deploy -- local up       # 再次启动
```

不要使用 `docker compose down -v` 或删除 pgdata 卷。服务器只支持一个活动后端：数据库所有权锁会拒绝第二个实例。健康检查失败不会改用内存存储；若数据库故障导致所有权连接丢失，恢复数据库后还需 restart 后端。

## 本地 HTTPS 和五人恢复演练

```sh
npm run deploy:setup -- check https 8445
npm run deploy:setup -- recovery https 8444
npm run deploy -- check up
npm run deploy:rehearse -- check recovery
```

源实例必须没有用户，目标数据库必须为空。重复演练应换两个实例名和空闲端口，不能在朋友已有数据的实例上运行。脚本用五个独立 Cookie／WebSocket 模拟玩家，在 HTTPS 下完成一局，记录收藏与预设，再开一局并投第一票；重启后核对身份、设置、座位和票数。随后停止源应用写入、执行备份、还原至目标，比较十张表的全部行，重连并继续未完的表决。原数据库、还原数据库和备份均保留。

HTTPS 使用 Caddy `tls internal`，根证书仅由测试客户端针对该连接显式信任，保存在 `deploy/certs/<实例>-root.crt`；没有安装进 macOS 或浏览器，也没有关闭证书校验。本地 IP 不发送 DNS SNI 时，网关选择127.0.0.1证书。普通浏览器直接访问这个自签入口会有信任警告，请使用8088的HTTP入口；不要绕过浏览器警告。公网模板另用受信任证书，不继承本地CA。配置依据 [Caddy TLS 文档](https://caddyserver.com/docs/caddyfile/directives/tls) 与 [全局选项文档](https://caddyserver.com/docs/caddyfile/options)。

演练报告在 `deploy/evidence/rehearsal-<源实例>.json`，只记检查结果和表计数，不保存访客凭证或角色。测试结束后可用 `deploy -- <实例> stop` 停止验收环境；保留卷和备份。`deploy:rehearse` 不会购买资源、开公网端口或安装系统证书。

## 备份

```sh
npm run deploy:backup -- local
```

生成 `deploy/backups/<项目>-<时间>.dump` 和同名 `.dump.json` 清单。使用 PostgreSQL custom 格式、一致性快照、SHA-256、字节数、数据库版本、迁移版本及镜像标识；输出先写.partial，成功后改名。失败不会给出成功提示。数据库密码通过容器环境提供，不出现在命令参数中。

备份可在线执行；升级和严格对照演练时先 `deploy -- local pause`，暂停网关与后端，避免备份时又产生新对局。恢复点为备份快照的时间，备份后的操作不会自动补回。清单和dump缺一不可，校验值只能检测损坏，不能证明文件来源可信。

备份包含私密角色、未结算的票和会话摘要，按私密数据管理；目录权限0700、文件0600，禁止提交或放入网站目录。当前只有本机副本，尚无异地备份和定时任务。实际上线后建议每天备份、升级前额外备份、保留最近7份日备份及4份周备份，并在用户选定存储位置后加密保存异地副本。不能把同一台机器上的备份当作机器损坏后的保障。

## 还原到新实例

```sh
npm run deploy:setup -- restored http 8098
npm run deploy -- restored database
npm run deploy:restore -- restored /绝对路径/backup.dump
npm run deploy -- restored up
```

选择未占用的端口。恢复脚本先校验文件与清单，拒绝源项目、正在运行应用的目标、非空目标或不匹配的 PostgreSQL 主版本；不会 DROP／覆盖原库。`pg_restore --single-transaction --exit-on-error` 失败时整批回滚。恢复期间保持目标应用停止，也不要从另一个终端启动该实例。

还原后先核对用户和会话、房间和准备状态、原角色和已投票、历史／统计／收藏／预设；再决定是否切换入口。在线状态按真实连接重新建立，重启提供60秒重连宽限。超过原会话有效期的备份不能让会话复活；恢复测试只有在凭证仍有效时才恢复原身份。

将来实际灾难恢复时，保持原域名及 Cookie 名称，停用旧应用，再将入口切换到验收过的新实例；否则换域名会因浏览器不携带原 Cookie 而表现为新访客。本地演练由测试程序持有原 Cookie 来模拟这一点，不宣称浏览器会自动跨域迁移身份。备份数据库不包含 `.env`、镜像文件或 Caddy 证书卷，这些需要另行安全保留。

## 升级与回退

1. 保存旧代码、旧 `IMAGE_TAG` 和两份镜像的确切ID；新版本使用新的唯一标签。不要用相同标签覆盖唯一的旧镜像。当前默认stage7标签只用于本地首次试验。
2. 修改该实例私密环境文件中的 IMAGE_TAG 为新标签，先 `deploy -- <实例> build`。构建不会重启运行中的容器。
3. 在空闲时 `deploy -- <实例> pause`，然后备份，并确认dump／清单存在。源数据库保留。
4. `deploy -- <实例> migrate` 执行新镜像中的迁移；脚本拒绝在本实例后端仍运行时迁移，迁移程序还会在数据库事务中取得后端独占锁，防止绕过脚本在线改结构。迁移事务失败则不进入上线步骤。新建实例在首次启动时自动迁移。
5. `deploy -- <实例> up`，验证health、网页、原账号入房、WebSocket、原对局与历史。保留前端和后端同一版本，不能只换网页。
6. 新版本有问题且schema仍兼容旧版本：pause，将IMAGE_TAG改回已保存旧标签，up并验收。不要重新build旧标签。
7. schema不兼容：保持旧库，使用上述流程将升级前备份恢复到另一个空实例，使用对应旧镜像，验证后切换入口。没有自动反向删列／删表脚本。回退会丢失备份后产生且未另行迁移的数据，需要先明确恢复点。

当前仅演练了容器重启和完整备份还原；尚无实际下一版schema，因此没有宣称跨版本降级已经验证。

## 后续公网发布模板

已提供 `deploy/public.env.example` 和 `deploy/compose.public.example.yaml`，仅作下一步审阅。公网模板会开放80／443，使用准确的HTTPS APP_ORIGIN、Secure Cookie以及 Caddy 自动证书与HTTP跳转；后端和数据库仍无主机端口。模板需和基础compose合并使用，本地安全脚本明确拒绝该项目／Origin。它当前只经过配置解析检查，不曾启动或联系公网CA。

ECS正式发布前还需确认：服务器地域与规格、已有域名的接入、DNS解析、主机防火墙、备份存储位置、证书申请与续期验证。当前先使用ngrok进行朋友验收，页面非本机地址已显示“朋友内测”。保持访客模式、邀请入房和关闭新成员加入，不加入会员或微信授权。

最终验收仍需 iPhone／Android 在微信中点邀请入房、锁屏和切聊天返回、Wi-Fi／移动网络切换、刷新重连，并用5人标准局及7人拓展局各实际完成一局。桌面模拟、类型检查和容器测试不替代手机验收。
