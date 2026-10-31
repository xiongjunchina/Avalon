# 首页对峙主视觉：本地字体记录

首页采用项目现有的两款游戏字体家族：**Ma Shan Zheng Regular（马善政毛笔楷书）**与 **ZCOOL XiaoWei Regular（站酷小薇体）**。只发布首页所需字符的本地 WOFF2，不向浏览器发送完整字库，也不新增字体 CDN 请求。

## 发布资源与用途

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
