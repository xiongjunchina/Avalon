# 门户最终字体与体积

本轮按确认稿重建字体层级：标题使用 **Ma Shan Zheng Regular（马善政毛笔楷书）**，辅助文字使用 **Noto Sans SC 静态650字重**，不用小薇体常规字重模拟粗体。

| 文件 | 字节 | 用途 |
| --- | ---: | --- |
| portal-calligraphy.woff2 | 4,716 | 局、嘻游、真假猴王、暗局 |
| portal-interface.woff2 | 23,984 | 品牌、口号、玩法说明、人数、类型、入口按钮 |

总计 **28,700B**，仅本地请求，`font-display:swap`。原门户小薇体文件已移除。实际650静态轮廓来自官方Noto Sans SC可变字体，不合成粗体；参考已确认稿的清晰、较厚辅助文字。动态／额外游戏名缺字可用系统后备字体，隐藏的页面大标题不扩充字库。

两字体均为 **SIL Open Font License 1.1**：`Calligraphy-OFL.txt` 与 `Interface-OFL.txt` 随资产保留。`calligraphy-source.json`、`interface-source.json` 记录官方原字库URL、源hash、最终字节/hash及字符覆盖。

- 马善政官方来源：https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
- Noto Sans SC官方来源：https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf

生成仅在本机临时目录使用完整TTF，字体通过fonttools裁剪为WOFF2；未把完整中文字库加入网页，也不依赖浏览器访问Google Fonts。Noto650子集复用同任务首页字体产物，复制到门户自身目录，避免门户依赖另一游戏服务。

对应测试检查wOF2头、许可、SHA-256、可见固定中文覆盖、两字体总量≤40,000B，并验证门户生成产物确实复制同一字体文件。
