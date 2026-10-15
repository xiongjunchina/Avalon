# 奇幻桌游视觉调整

日期：2026-09-30。依据本次反馈：阵营与角色统计分区，并将整体视觉调整为更具桌游氛围的界面。

后续补充：八个角色已增加原创人物插画，应用于私密身份牌、角色战绩及公开身份列表；原线条纹章作为加载失败的后备。最新素材和验证见[角色插画与身份牌](ui-role-art.md)。下文保留首轮视觉调整记录。

## 已实现

- 战绩按「总览 → 阵营战绩 → 角色战绩」展示。阵营使用蓝红两张纹章卡；八个角色各自一张卡，不再混入同一张表。
- 保留完成局数、胜负、胜率和中断数；零局胜率仍为“—”，中断不计胜负。
- 使用月夜城堡、深墨底色、古金强调、衬线标题与原创线条纹章。房间座位改为背面卡牌；个人档案增加城堡横幅与盾形头像。
- 统一调整房间、个人中心、历史、复盘、设置与私密身份区域；等待席位只用本人预置头像，角色纹章仅出现在已展开的本人身份或终局已公开的身份中。
- 开发版说明收进页脚；保留本机访问与手机验收待完成说明。修正结算页“个人战绩将在后续开放”的旧提示。
- 未引入新依赖、外部字体请求或图片服务。现有数据库与游戏规则没有变更。

## 验证

- `node --import tsx --test apps/web/test/*.test.ts`：7项通过。覆盖私密面板、匿名复盘、零局胜率和连接恢复。
- `npm run typecheck` 和 `npm run build`：通过。
- 浏览器确认两个独立且有名称的统计区域、2张阵营卡及8张角色卡，旧测试战绩仍为2局／0胜／2负。
- 320px、390px视口检查（扣除滚动条后305／375px）无整页横向溢出；角色卡在小屏双列、大屏四列，阵营始终独立成区。浏览器视口覆盖已恢复默认。
- 验证历史复盘可打开、公开角色徽章正常、等待区准备／取消准备正常；房间恢复未准备，未改变玩法设置。
- 核心静态色对比度：正文13.26:1、辅助文字8.56:1、主按钮9.15:1、蓝方文字10.30:1、红方文字8.82:1。按钮有键盘焦点轮廓；按下反馈只做位移，遵循减少动态效果偏好。
- 本次只涉及前端视觉与信息布局，未重复执行数据库故障与规则引擎测试；上一阶段58项完整结果见stage-6-validation.md。真实微信手机验收仍待进行。

截图：[房间](ui-fantasy-room.png) · [战绩分区](ui-fantasy-stats.png)。

## 原创背景素材

使用内置 `image_gen` 工具生成并检查，无第三方游戏图、文字、水印或人物。运行时素材保存于 [avalon-moonlit.png](../apps/web/public/art/avalon-moonlit.png)，已复制到项目内，构建随网页一起发布；源图约2.1MB，当前仅在本地运行。线条纹章为 `apps/web/src/Heraldry.tsx` 内的原创SVG。

最终生成提示词：

> Use case: stylized-concept. Asset type: original illustrated banner background for a mobile Arthurian social deduction tabletop game website. Scene: a mysterious medieval stone castle rising above a still moonlit lake, small warm amber windows, distant jagged mountains, a silver crescent moon, gentle mist. Style: richly detailed hand-painted fantasy board-game box art, mature and elegant, slightly engraved storybook texture, not photorealistic. Composition: very wide landscape, about 2.5:1; castle and moon in the right half, left half mostly quiet dark lake and sky reserved for readable interface copy, panoramic horizon around middle. Palette: very dark ink navy, muted teal slate, antique gold highlights, no purple. Mood: secret allegiances, nocturnal calm, old legend. No people, no faces, no weapons in foreground, no text, no letters, no logo, no watermark, no UI, no border. Actual web interface text will be added separately.
