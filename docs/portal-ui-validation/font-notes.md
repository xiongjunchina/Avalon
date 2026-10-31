# 门户风格字体与体积记录

为使 Android 等未安装楷体／小薇体的设备也能显示一致的游戏风格，门户使用项目既有字体家族 **ZCOOL XiaoWei Regular（站酷小薇体）** 的本地 WOFF2 子集。网页无需请求 Google Fonts 或其他第三方字库。

## 来源与许可

- 家族与原小游戏 `apps/minigame/assets/fonts/display.ttf` 相同。
- 原小游戏文件已经过字符裁剪，缺少门户所用的“博、夜、弈、昼、绽、黑”等字；没有改写该文件。
- 构建阶段从官方 [google/fonts 原字库](https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf) 取得完整字体，只保留在临时目录，不放进门户发布目录。
- 原字库 SHA-256：`a42b620140f493db42f741351dfbf343c0936d58588ee8004b8b2a218d997ff1`。
- 许可为 **SIL Open Font License 1.1**。原项目版权说明与许可全文保留在 `deploy/portal/assets/fonts/OFL.txt`。

## 发布文件

| 文件 | 字节 | 用途 |
| --- | ---: | --- |
| `portal-display.woff2` | **21,520** | 浏览器实际加载的字体，Regular／400，111 个所需字符 |
| `OFL.txt` | 4,399 | 随发布保留的字体许可，不由页面主动请求 |
| `source.json` | 2,763 | 来源、校验值和覆盖字符记录，不由页面主动请求 |

WOFF2 SHA-256：`bc99765097f3fd4dbd1f64dc087c1346b50547ab362dd3d291e03fd817555e13`。

子集使用 fonttools 4.60.2、WOFF2/Brotli 编码，保留 kerning，移除 hinting 指令；字符轮廓不改变。字体资源低于 **30,000B** 预算，没有把原始 6.31MB 字库加入网站。

## 字符与回退

- 包含当前登记表的游戏名、宣传句、说明、人数、类型、入口文字，以及品牌、总口号、旧登记表回退词、必要数字和标点。
- 以保存后的 WOFF2 `cmap` 再次检查，全部所需中文和中文标点均覆盖。
- ZCOOL XiaoWei 原字体本身不包含中点 `·` 和箭头 `→`，这两个符号由 CSS 后备字体绘制；`source.json` 对应 `fallbackCharacters` 已明确记录。
- 新增游戏或修改文案时，应把新字符加入本子集，验证覆盖与字体总量，再替换 WOFF2；无需重新发布完整字库。

建议 CSS 使用本地 `@font-face`、`font-display: swap`、`font-weight: 400`。不合成粗体，让宣传文字以游戏风格的常规字重显示；页面首次绘制可以先使用后备字体，不等待字体下载。
