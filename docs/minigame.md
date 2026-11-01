# Avalon 微信小游戏：候选包、联调与发布

本轮只推进 Avalon，使用 apps/minigame 的 Canvas 小游戏工程，AppID 为 wxdb4e422c14adab3f。旧 apps/miniprogram 网页容器不参与打包。Mafia 继续网页试玩，不放入这个 AppID，微信首屏不展示游戏大厅。

## 服务地址

| 用途 | 地址 |
| --- | --- |
| 网页 | https://game.ccnepower.com/avalon/ |
| 构建参数 WECHAT_MINIGAME_API_BASE_URL | https://game.ccnepower.com/avalon |
| 接口 | /avalon/api/... |
| 房间 WebSocket | wss://game.ccnepower.com/avalon/api/rooms/<roomId>/socket |

构建器允许 HTTPS 地址带游戏前缀，规范化末尾斜杠；拒绝 HTTP、用户密码、查询参数、片段及路径穿越。默认已使用新地址，不再使用旧域名和 8443 端口。网关只剥除一次 /avalon，后端继续使用原 /api/...。ECS 新路径部署并验收前，不能将候选包视为可正式登录。

## 生成可导入的候选包

macOS/Linux 在仓库根目录执行：

```sh
WECHAT_MINIGAME_VOICE_ENABLED=true \
  WECHAT_MINIGAME_API_BASE_URL=https://game.ccnepower.com/avalon \
  npm run package:minigame -- --version=0.5.0
```

Windows PowerShell：

```powershell
$env:WECHAT_MINIGAME_API_BASE_URL='https://game.ccnepower.com/avalon'
$env:WECHAT_MINIGAME_VOICE_ENABLED='true'
npm run package:minigame -- --version=0.5.0
```

命令执行类型检查和小游戏测试，生成独立目录 dist/releases/minigame-<版本>-<随机后缀>。开发者工具选择“小游戏”，导入其中的 project 文件夹，确认 AppID、开发/上传权限以及 urlCheck: true。上传时版本号与清单、后台记录一致。

release.json 记录源码提交、工作区状态、AppID、完整 API 基地址、网页入口、包体大小和文件 SHA-256。apiOrigin 仅表示域名，带 /avalon 的完整地址在 apiBaseUrl。包中不得含 AppSecret、管理员密钥或用户令牌。生成包不等于上传、提审或发布。

## 服务端与微信后台

服务端私有环境需配置 WECHAT_MINIGAME_APP_ID 和 WECHAT_MINIGAME_APP_SECRET，AppID 与客户端一致。AppSecret 仅保存在 ECS 私有配置及服务端进程中，不发送到聊天、客户端或仓库；检查时仅报告是否已设置。

客户端通过 wx.login 获得临时代码，服务端通过 jscode2session 核验并签发会话；房间连接使用单次 socket-ticket。网页与小游戏共用 Avalon 房间、规则和数据库，支持仙友码切换旧账号，不与 Mafia 合并账号。

| 微信后台配置项 | 域名 |
| --- | --- |
| request | https://game.ccnepower.com |
| downloadFile | https://game.ccnepower.com |
| socket | wss://game.ccnepower.com |

合法域名不填写 /avalon；路径保存在客户端构建参数中。保持域名和证书校验开启。网站ICP备案与微信账号自己的备案、资质和版本审核分别检查，以后台实际状态为准。

## 首发范围

首发沿用现有登录、账号切换、房间、对局、文字传音、邀请、头像及个人记录能力，均需真机验收。

**当前提供微信原生语音真机联调候选包，不代表已通过真机验收或正式发布。** 小游戏构建默认启用语音，本次命令仍显式设置 `WECHAT_MINIGAME_VOICE_ENABLED=true`，清单记录实际开关、人数限制和待验收状态。ECS 服务端开关默认关闭，需要在私有配置中明确启用并重建服务端容器；只更新客户端或只修改 `.env` 而不更新容器均不足以联调。

若需要无语音包，显式设置 `WECHAT_MINIGAME_VOICE_ENABLED=false` 重新打包；该包不声明录音权限、不注册微信语音事件。网页声网保持独立，微信原生语音与网页声网不互通。开启微信语音不会改变 5–12 人游戏规则，也不会把授权或语音连接变成准备、开局的前置条件。

## 两端入口与账号接续

小游戏与网页版均保留 5–12 人规则，沿用同一 Avalon 数据库；不新建第二套玩家身份或战绩。现有微信登录代码需要先完成体验版真机联调，不以自动化通过代替已验收。

- **微信语音**：启用候选包中，5–10 人房可在声音设置中主动加入，默认闭麦；同房成员应统一选择微信语音，不能把网页声网当作同一通话。
- **网页语音**：需要跨端或 11–12 人内置通话时，全体成员使用网页版声网。房间的网页语音兼容开关只控制网页声网，不自动启用或禁止微信语音。
- **无内置语音**：线下交流或自选外部通话，游戏内不要求麦克风授权或语音连接成功。
- **转到网页版**：房间工具及声音设置提供入口，对局中仍可访问。本人链接保留账号、房间和座位；复制本身不退房，网页版确认成功后在网页继续操作。
- **本人链接与邀请链接分开**：本人接续链接携带短效单次凭证，5 分钟内仅供本人使用，勿转发；朋友邀请链接只携带房间邀请标识，不含本人登录凭证。

后端接续接口为 `POST /avalon/api/sessions/web-handoff` 和 `/exchange`；个人链接使用 `/avalon/#avalon-handoff=...`，不把长期会话令牌或仙友码放入 URL。后端版本尚未支持时应提示错误，原房间和游戏继续可用。此阶段不强制旧房迁移、不改变网页已有声网流程；恢复房间后，仍由玩家主动开启语音。

## 发布顺序及验收

1. 按 [公共入口迁移指南](game-portal.md) 完成 ECS 部署和公网 HTTPS、新旧路径、Mafia 网页回归。
2. 核对 ECS 微信凭据是否配置、AppID 是否匹配，以及实际部署的微信登录与 socket-ticket 接口。
3. 配置合法域名，保持校验开启，导入候选包并检查开发者工具运行错误。
4. 使用专门测试账号真机验证：登录、仙友码切换、与网页同房完整对局、好友邀请、选图、断网重连和后台恢复。不删除原用户或战绩。
5. 合作伙伴核对 AppID 的实时语音能力、麦克风隐私用途声明，使用至少两台真机测试登录、主动加入、默认闭麦、双向通话、拒绝授权后重试、后台/来电恢复、退出，以及 11–12 人房仍能正常游戏。详见 [微信语音联调](wechat-native-voice.md)。
6. 上传体验版并记录回执；管理员完成必要扫码与平台确认，按实际功能核对隐私指引和后台待办。
7. 准备与该候选版本一致的 Avalon 玩法说明及真实微信截图。无界面 Canvas 或浏览器预览仅用于开发验证，不冒充真机审核截图。
8. 提交对应版本审核，通过后发布，记录上传版本、审核结果和正式入口。未完成的备案、资质或材料待办应明确记录，不能写为已上线。

代码测试、ECS 公网响应、微信真机联调、平台上传和发布回执分别证明对应阶段，不能相互代替。
