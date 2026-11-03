# 内容安全整改：开通、部署与重新提审

本文针对 Avalon 现有 AppID `wxdb4e422c14adab3f`、域名 `https://game.ccnepower.com/avalon/`。保留昵称、文字聊天和自定义头像；不发布 Mafia 微信客户端，不改变网页声网及小游戏微信语音的接入方式。

**状态边界：代码检查与 mock 测试不代表已上线。本文件编写时，ECS 部署、阿里云实际调用权限、微信实际调用权限、历史内容审核和手机体验版验收均待执行。** 每一项通过后记录时间、版本及脱敏结果，再提交审核。不要把以下操作说明或提审草案当作验收完成记录。

## 一、内容如何处理

- 新昵称、文字消息、头像先检查，明确通过才写入公开资料或广播给其他玩家。微信身份已验证的操作使用微信小游戏内容安全 API；无微信身份的网页操作使用阿里云内容安全增强版。
- 自定义头像先转换成已验证格式的不可变图片，供应商通过短时受控地址读取；通过后才产生可公开的头像地址。客户端不能提交任意外链，供应商调用密钥始终留在服务端。
- 待人工复核、拒绝、超时、额度不足、未知结果和服务异常均不能当作通过。网页和小游戏显示可理解的提示；失败不会把未审核的新内容发布出去。
- 历史昵称、聊天和头像在数据库保留；未通过审核的内容暂用占位展示。历史审核与人工复核不删除用户、仙友码、战绩或原始资料。
- 本轮处理文本和头像，不新增音频上传、录音或语音审核服务。需要分别复测游戏流程和现有声网/微信语音。

## 二、在阿里云开通并创建最小权限账号

1. 用管理员账号登录阿里云，进入“内容安全 / AI 安全护栏”，开通**内容安全增强版**的按量付费服务。确认账号余额和账单提醒。只调用下面列出的文本、图片服务；无需购买语音、视频或人工审核套餐。
2. 在文本审核规则配置中检查 `nickname_detection_pro`、`comment_detection_pro`，保留审核所需的违法违规检测项。在图片审核规则配置中检查 `profilePhotoCheck`。服务名需与服务器配置一致，界面文字如有变化以控制台当前显示为准。
3. 在 RAM 控制台创建专用用户，例如 `avalon-content-safety`。只需要程序访问凭据，不需要给这个用户开放控制台登录。
4. 新建自定义权限策略，例如 `AvalonContentSafetyApiOnly`，使用下面的 JSON；将此策略授权给专用 RAM 用户。不要授予管理员或 `FullAccess` 策略。
5. 为该专用 RAM 用户创建 AccessKey。下载或保存到私有位置，只在 ECS Workbench 私有配置步骤录入。不要贴到聊天、仓库、截图、构建命令或微信候选包中；不要使用阿里云主账号 AccessKey。

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "yundun-greenweb:TextModerationPlus",
        "yundun-greenweb:ImageModeration"
      ],
      "Resource": "*"
    }
  ]
}
```

两项 API 的官方权限表均不支持资源级授权，所以这里必须用 `Resource: "*"`；它仅配合这两项 action，不代表授予所有阿里云操作权限。不需要 OSS、ECS 管理或账单管理权限。[文本接口授权信息](https://help.aliyun.com/zh/document_detail/2669858.html)、[图片接口授权信息](https://help.aliyun.com/zh/document_detail/2528742.html)。

本次选用的调用配置如下。上海公网 endpoint 可供当前 ECS 访问；不要把旧版 `green.cn-shanghai.aliyuncs.com` 与增强版 `green-cip` 混用。

| 用途 | API / Service | 配置 |
|---|---|---|
| 昵称、用户填写的房间名称 | `TextModerationPlus` / `nickname_detection_pro` | 资料场景 |
| 房间文字聊天、私聊 | `TextModerationPlus` / `comment_detection_pro` | 统一按公聊内容策略检查 |
| 自定义头像 | `ImageModeration` / `profilePhotoCheck` | 头像场景 |
| 地域 | `cn-shanghai` | 公网 endpoint：`green-cip.cn-shanghai.aliyuncs.com` |
| API 版本 | `2022-03-02` | ACS3 签名，服务端调用 |

本项目采取保守策略：阿里云 `none` 放行，`low` / `medium` 进入应用人工复核，`high` 拒绝；不认识的结果或请求失败阻止发布。应用人工复核不调用阿里云付费人工审核 API。[文本服务及风险说明](https://help.aliyun.com/zh/document_detail/2684669.html)、[图片服务及参数](https://help.aliyun.com/zh/document_detail/2528742.html)。

## 三、ECS 私有配置

在 `/opt/avalon/deploy/.env.ecs` 保留现有配置，并由部署脚本录入或更新以下变量。文件权限应为 `600`。不要开启 `set -x`，不要把完整 `docker inspect`、Compose 渲染结果或环境文件发到聊天，因为其中可能包含密钥。

| 变量 | 值 / 处理方式 |
|---|---|
| `CONTENT_SAFETY_ENABLED` | `prepare` 只在私有 `.env.next` 写入 `true`；`cutover` 先在维护模式验证，通过后开放游戏 |
| `CONTENT_SAFETY_MAINTENANCE` | 预检和历史审核期间为 `true`，成功后改为 `false`；不可跳过审核直接关闭维护 |
| `APP_ORIGIN` | 保持 `https://game.ccnepower.com` |
| `APP_BASE_PATH` | 保持 `/avalon/` |
| `WECHAT_MINIGAME_APP_ID` | 保持 `wxdb4e422c14adab3f` |
| `WECHAT_MINIGAME_APP_SECRET` | 沿用正确的私有值，不放进候选包 |
| `ALIYUN_CONTENT_ACCESS_KEY_ID` | 专用 RAM 用户 AccessKey ID |
| `ALIYUN_CONTENT_ACCESS_KEY_SECRET` | 同一用户 AccessKey Secret |
| `ALIYUN_CONTENT_SECURITY_TOKEN` | 长期 RAM AccessKey 留空；使用 STS 时须配置有效 token 并另行安排刷新 |
| `ALIYUN_CONTENT_REGION` | `cn-shanghai` |
| `ALIYUN_CONTENT_ENDPOINT` | 可省略；默认 `https://green-cip.cn-shanghai.aliyuncs.com/` |
| `ALIYUN_CONTENT_NICKNAME_SERVICE` | `nickname_detection_pro` |
| `ALIYUN_CONTENT_CHAT_SERVICE` | `comment_detection_pro` |
| `ALIYUN_CONTENT_IMAGE_SERVICE` | `profilePhotoCheck` |

不更改 `AGORA_*`、已有语音开关、Cookie 配置、Compose 项目名、数据库连接或数据卷。临时 STS 凭据支持签名，但本实现不自动申请/刷新 STS，初次部署不要只填一次短期 token 后长期运行。

## 四、Workbench 发布顺序

当前由管理员在阿里云 ECS Workbench 执行，不要求额外开通 SSH。脚本入口为 `scripts/install-content-safety-ecs.sh`，支持 `prepare`、`cutover`、`verify`、`--help`。它不会执行 `git pull`、切换分支或覆盖未提交修改。先推修复分支，完成 `prepare` 后才合入 `main`，避免定时器提前发布缺少凭据的新版本。

### 1. 保留当前运行版本，取得准备脚本

先用本人专用的验收账号登录现有 Avalon 小游戏，记录该账号六位仙友码；稍后的预检只读取该账号真实绑定的 OpenID，不借用其他玩家身份。

修复分支推送成功后，在 Workbench 执行：

```bash
cd /opt/avalon
git fetch --ipv4 --no-tags origin codex/content-safety-review
git show FETCH_HEAD:scripts/install-content-safety-ecs.sh > /root/install-content-safety-ecs.sh
chmod 700 /root/install-content-safety-ecs.sh
bash /root/install-content-safety-ecs.sh prepare
```

`prepare` 在旧版仓库上即可运行；它读取并记录现有容器、镜像、重启次数、Compose 和私有配置，检查进行中对局，暂停 **Avalon 与 Mafia 的自动更新定时器**并保存原始运行状态。暂停更新不会停止 Mafia、公共入口或其他游戏容器。脚本用隐藏输入收集专用 RAM AccessKey，生成权限为 `600` 的 `.env.next`，原 `.env.ecs` 保持不变，不启动新容器，不调用付费 API。

如需从已保存的私有文件读取，可改用 `prepare --config-file /root/avalon-content-safety.json`。这是 JSON 文件，只允许上表 `ALIYUN_CONTENT_*` 字段；先设 `chmod 600`，不要将密钥写到 shell 命令历史。脚本支持 Mafia ECS 安装器使用的 `mafia-deploy-ecs` 项目名及旧名称 `mafia`、`mafia-ecs`。存在多个候选或使用其他项目名时，核对实际 Compose 项目标签，再加 `--mafia-project <实际项目名>`；不会只凭容器名字猜测。项目识别失败发生在暂停定时器和修改配置之前，修正参数后可重跑 `prepare`。

准备成功后保留输出的私有发布记录目录，并告知维护人员“prepare 已完成”，然后才合入 `main`。若有进行中对局、另一发布正在运行或准备失败，先解决提示的问题，勿跳过检查。

### 2. 明确更新到已审核的 main 提交并切换

维护人员合入 `main` 并提供完整提交号后，执行下面步骤。将示例六位仙友码换成本人的专用验收账号；完整提交号必须与维护人员给出的发布版本一致，不要盲目使用最新代码。

```bash
cd /opt/avalon
git fetch --ipv4 --no-tags origin main
git switch main
git merge --ff-only origin/main
git rev-parse HEAD
```

确认输出等于交付的完整提交号后运行：

```bash
bash scripts/install-content-safety-ecs.sh cutover \
  --revision <交付的完整40位提交号> \
  --test-player-code <本人的六位微信验收仙友码>
```

`cutover` 强制要求当前分支为 `main`，且 `HEAD`、本地 `origin/main` 与指定提交一致。它先构建 Avalon 的 `server/gateway`，构建期间原游戏继续运行；构建后再次确认没有进行中对局，才停止这两个 Avalon 容器。停止入口后还会再检查一次，防止刚好有玩家在切换瞬间开局。

随后脚本保存 Avalon 与 Mafia 的 `pg_dump -Fc` 数据库备份，只启动处于**维护模式**的新版 Avalon；新增迁移 `014_content_safety.sql` 保留原有数据。新服务的受控图片检查地址在维护期间可用，其余游戏操作暂停。脚本依次运行：

- `probe <验收仙友码>`：真实检查微信与阿里云的昵称、聊天、头像接口，正常样本必须全部通过。
- `inventory`：记录历史内容数量。
- `audit`：检查历史内容，原记录保留；拒绝和待审内容保留遮挡。请求异常计数必须为零才能继续。

这部分会调用按量计费的内容安全 API，维护时间取决于历史内容量和供应商响应。全部通过后才关闭维护模式，重建 Avalon 的两个服务，验证本机经域名 HTTPS、普通公网 HTTPS、各游戏入口及其他容器基线，再记录实际版本并恢复原先运行的定时器。没有重新创建公共网关、Mafia、其他游戏或任何数据库容器的步骤。

### 3. 复核并完成手机验收

```bash
cd /opt/avalon
bash scripts/install-content-safety-ecs.sh verify
systemctl is-active avalon-auto-update.timer mafia-auto-update.timer
systemctl list-timers --all avalon-auto-update.timer mafia-auto-update.timer
```

`verify` 只接受本轮已成功切换的记录，不把旧版本健康当作完成整改。TLS 检查未使用跳过证书校验参数；普通公网检查与本机 `--resolve` 检查分别留档。`verification.json` 明确标记真实手机及语音为 `NOT_TESTED`，这些仍须完成下一节验收。原先没有运行的定时器不会被擅自启用。

微信无害样本能力预检见 [内容安全接口依据及预检](content-safety-provider.md)。`HTTP 200`、拿到 token 或签名正确都不是内容检查成功的充分证据，必须看到明确通过结果。目标账号如不支持游戏专用 API，应先解决微信后台能力问题，不能伪造 OpenID 或切到过时接口规避。

切换失败时先停新版 Avalon 的写入，把数据库中指向本服务受控头像地址且已审核通过的头像转换为相同图片的 dataURL，使旧服务仍可显示；不覆盖其他头像或已经成功提交的合法图片内容。随后用原 Compose 快照、原私有配置和保留的旧镜像，只恢复 Avalon `server/gateway`。不删除数据库审核表、用户或战绩，不进行全库恢复或重建其他服务。Mafia 定时器恢复原运行状态，**Avalon 定时器保持暂停**，避免再次自动发布失败版本。脚本会报告回滚验证是否成功，日志只写入权限受限的发布目录。若前一版本没有审核保护，不能把回滚后版本当作可重新提审的整改版本；排障完成后重新准备、发布与验收。

## 五、必须留存的验收证据

| 检查 | 通过标准 | 状态 |
|---|---|---|
| 阿里云实际调用 | 三类正常样本均明确通过，账号权限与配置正确 | 待执行 |
| 微信实际调用 | 真实验收账号的资料、聊天、头像检查均明确通过 | 待执行 |
| 双端昵称 / 房间名称 | 正常内容保存；拒绝、待审、异常内容不公开 | 待执行 |
| 双端房间聊天 / 私聊 | 通过后才发出；其他玩家收不到被拦截文本 | 待执行 |
| 双端头像 | 正常图片可显示；待审、拒绝和异常图片不公开；外链提交被拒绝 | 待执行 |
| 历史资料 | 原始记录保留；通过内容恢复展示；待审内容继续遮挡 | 待执行 |
| 人工复核 | 管理员才能处理，结果有记录；已拒绝内容不会自动公开 | 待执行 |
| 网页游戏 / 声网 | 登录、同房、对局、双机通话、重连正常 | 待执行 |
| 微信游戏 / 微信语音 | 真机登录、同房、对局、通话、重连正常 | 待执行 |
| 其他服务 | 大厅、Mafia、其他游戏入口可访问，容器 ID / 启动时间未改变 | 待执行 |
| 发布证据 | ECS 镜像提交号、GitHub 提交号、候选包版本对应；定时器恢复 | 待执行 |

测试拒绝和服务异常路径优先使用自动化的受控 mock，不在正式聊天室发布违规样本。供应商的无害样本实测验证开通与连通性；应用阻断能力由自动化测试和专用验收账号共同验证。两类证据均需保留。

## 六、生成新版候选包

在代码提交后构建，让发布清单记录干净工作树及准确提交号。以下使用 `1.0.4` 作为本次候选版本；若微信平台已占用该版本号，递增后同步所有发布记录。

```bash
WECHAT_MINIGAME_APP_ID=wxdb4e422c14adab3f \
WECHAT_MINIGAME_API_BASE_URL=https://game.ccnepower.com/avalon \
WECHAT_MINIGAME_VOICE_ENABLED=true \
WECHAT_MINIGAME_PERF_HUD=false \
npm run package:minigame -- --version=1.0.4
```

命令输出 `dist/releases/minigame-1.0.4-*/project`，导入微信开发者工具。核对 `release.json` 的 AppID、API 地址、语音开关、源码提交号与 `sourceDirty:false`；候选包不得包含阿里云 AccessKey、AppSecret 或管理密钥。先上传体验版并完成上表手机验收，再选择该开发版本提交审核。

## 七、重新提审说明草案

**以下说明只有在部署、接口预检与真机验收实际通过后才能原样使用；未完成的项应如实写明并暂缓提审。**

> 本次版本针对用户自定义内容的审核问题完成整改。昵称、用户填写的房间名称、房间聊天、私聊及自定义头像均在服务端审核通过后才公开。微信身份操作接入小游戏文本和图片内容安全接口；网页来源的用户内容接入阿里云内容安全增强版，避免网页与小游戏同房时绕过审核。疑似内容进入管理员复核，违规内容拒绝，审核失败或超时不公开；历史内容保留原始记录并进行检查，尚未通过的内容使用占位显示。客户端保留昵称、聊天和自定义头像功能，并提供对应提示。
>
> 建议审核路径：登录 → 修改昵称与头像；首页 → 创建或加入测试房间 → 传音文字聊天；仙友 → 私聊。测试账号与测试房号使用本次准备的有效信息。整改截图及操作录像与本次候选版本一致。

同时核对微信后台隐私保护指引：用户自行提交的昵称、文字和头像会用于内容审核，应依据实际数据流说明用途与第三方处理情况，不把本次文本/图片审核描述为采集语音录音。提审附件建议包含正常提交成功、被拒绝提示、待审核提示和历史内容保护显示。请不要在审核说明、截图或录像中暴露私钥、token、管理密码、其他真实玩家资料。
