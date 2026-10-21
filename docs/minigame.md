# 微信小游戏客户端：构建和联调

本工程以 `origin/main` 的 `7ccaaa157ea05f3bd4d9ed10a9819e1baeb773b3` 为基线。小游戏源码位于 `apps/minigame`，构建输出位于 `dist/minigame`。服务端复用现有 PostgreSQL、房间协议和游戏规则。

## 构建

在仓库根目录执行：

```powershell
$env:WECHAT_MINIGAME_APP_ID='wxdb4e422c14adab3f'
$env:WECHAT_MINIGAME_API_BASE_URL='https://avalon.ccnepower.com:8443'
npm ci
npm run typecheck
npm run build:minigame
```

微信开发者工具选择“小游戏”并导入 `dist/minigame`。`project.config.json` 保持 `urlCheck: true`。不要将 AppSecret、管理员密钥或用户令牌写入小游戏包。

## 服务端

服务端进程需从安全的部署环境读取 `WECHAT_MINIGAME_APP_ID` 和 `WECHAT_MINIGAME_APP_SECRET`。`AppSecret` 只留在服务端。小游戏调用 `wx.login` 后，服务端通过微信 `jscode2session` 核验临时代码并签发自身的会话令牌。新接口部署前，生产服务无法接受小游戏登录。

当前线上健康检查 `https://avalon.ccnepower.com:8443/api/health` 可访问，但不能据此认定本分支的新接口已部署。上线前应读取服务器实际代码版本，并以真实 AppID 登录验证 `/api/sessions/minigame`、`/api/minigame/socket-ticket` 及房间 WebSocket。

## 微信后台合法域名

当前构建所用入口包含端口 **8443**。微信后台需将 `https://avalon.ccnepower.com:8443` 加入 request 合法域名，将 `wss://avalon.ccnepower.com:8443` 加入 socket 合法域名。开发者工具已经以开启域名校验的设置显示前者不在当前 request 列表中。填写后以开发者工具重新编译并在真机复核；不要关闭域名校验来代替配置。

若改为标准 443 入口，先让 Nginx 与证书在 443 正常服务，再以 `WECHAT_MINIGAME_API_BASE_URL=https://avalon.ccnepower.com` 重建，微信后台同步填写无端口的 HTTPS/WSS 域名。

## 验收状态

| 项目 | 状态 |
| --- | --- |
| 开发者工具导入、Canvas 登录首屏 | 已看到，无运行时异常 |
| 本地类型检查与小游戏单元测试 | 已通过；每次提交后重跑 |
| 微信真实登录及断线重连 | 待合法域名和服务端新接口 |
| 网页与小游戏同房完整牌局 | 待真机联调 |
| 玩家端全部功能及管理员写操作 | 代码仍在补齐，待联调 |
| 网页与小游戏实时语音互通 | 待确认可用的跨端 SDK、服务账户和真机权限 |
| 开发者工具上传 | 尚未执行，以上验收未通过 |

实时语音需要选择同时支持现有网页端和微信小游戏的服务，并完成服务端凭据、麦克风权限与跨端真机测试。当前网页使用 Agora Web SDK，小游戏没有可直接复用的 Web DOM/RTC 环境，因此不能把网页 SDK 直接打包进小游戏。
