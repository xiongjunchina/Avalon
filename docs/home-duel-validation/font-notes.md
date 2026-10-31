# 首页对峙主视觉：本地字体记录

当前首页使用 **Ma Shan Zheng Regular（马善政毛笔楷书）**绘制标题／主口号，使用 **Noto Sans SC 650** 绘制辅助文字与控件。两份实际字体共36,724B。下方保留首版小薇体记录，旧文件不再由首页请求；新Noto字库详见文末修订。网页不发送完整字库，也不新增字体CDN请求。

## 首版资源记录（保留以备追溯）

目录：`apps/web/public/art/home/fonts/`。放在 `/art/` 下，以兼容现有 `assetUrl` 的子路径发布规则。

| 文件 | 字节 | 字符 | 用途 |
| --- | ---: | ---: | --- |
| `home-calligraphy.woff2` | 12,740 | 29 | 游戏标题、原诗句及“两个悟空，你信哪一个？” |
| `home-display.woff2` | 28,124 | 126 | 首页全部可见固定文案、按钮、宣传、模式、邀请提示、数字及必要标点 |

两份合计 **40,864B**，每份低于35,000B，总计低于60,000B。使用常规字重400，不合成粗体。建议 `font-display: swap`，避免等待字体才显示操作按钮。

## 来源与许可

- [Ma Shan Zheng 官方原字库](https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf)：下载至临时目录，未放入发布资源。
- [ZCOOL XiaoWei 官方原字库](https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf)：复用上一轮门户工作已缓存的官方原文件，重新为首页裁剪。
- 两款均采用 **SIL Open Font License 1.1**，版权声明和许可全文分别保留在 `calligraphy-OFL.txt` 与 `display-OFL.txt`。
- `source.json` 记录原字库和最终 WOFF2 的 SHA-256、字节数、实际 `cmap` 覆盖字符、后备字符及处理参数。

## 覆盖和回退

- 从最终保存的 WOFF2 重新读取 `cmap` 验证，当前首页可见的固定中文以及所需中文逗号、句号、顿号、问号均已覆盖。
- 书法体原字体不含中点 `·`；小薇体原字体不含 `·` 和单人试玩的箭头 `›`。这些非中文符号由 CSS 后备字体显示，元数据已明确列出。
- 玩家昵称是动态内容，未把整个中文字库发布到首页；缺字正常回退。Emoji、仅供读屏使用的 `aria-label` 以及浏览器原生 title 提示也不扩充本子集。
- 未来改变首页固定可见文案时，应更新子集并重新检查 `cmap` 和字节预算，不能只更新 CSS 字体名称。

## 处理与验证

使用 fonttools 4.60.2、WOFF2/Brotli，保留 kerning、移除 hinting，不改变字符轮廓。检查最终 `wOF2` 文件头、两项体积预算、全部请求中文覆盖、保存后 `cmap`、SHA-256 和随附许可；均通过。原完整 TTF 仅留临时目录，不进入 Git。

## 本轮按确认稿修正：清晰的界面字重

为匹配确认稿中较粗、清晰的辅助文案与按钮文字，新增 **Noto Sans SC 固定650字重** `home-interface.woff2`，**23,984B、167个字符**。标题与主口号继续使用已有马善政书法字库；前述小薇体来源记录保留，但辅助界面可改用这份真实650字重字体，不依赖浏览器合成加粗。

- 来源为 [Google Fonts 官方 Noto Sans SC 可变字库](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf)，原文件只下载至临时目录，不发布。
- 从可变字体实例化为 `wght=650`，移除未用汉字和 hinting，再编码为本地 WOFF2；发布文件不含 `fvar`，`OS/2.usWeightClass=650`。
- 覆盖首页固定可见文案，以及统一入口登记表中两款游戏的名称、主宣传语、说明、人数、类别、按钮与品牌口号。全部所需汉字、数字、中文标点、中点和箭头均经最终 `cmap` 验证，未遗漏字符。
- 许可全文随 `interface-OFL.txt` 保留；源文件和最终子集的 SHA-256、字节数、覆盖字符记录在 `home-interface-source.json`。门户可复制同一字库到自身资源目录，保持两个站点独立发布。
- 动态昵称和 Emoji 仍按后备字体显示；没有引入完整中文字库、字体 CDN 或新前端依赖。
