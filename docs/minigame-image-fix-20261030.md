# 图片缺失修复（2026-10-30）

用户报告手机首页背景和角色图均不可见。它们本应是包内文件，不能把此问题归因于公网备案。

代码发现：所有背景/角色/内置头像统一使用 WebP，且头像选择器误用中文名称请求 emblems 图片。修复头像选择器；将网页同源图片离线转换为JPEG，构建仅打包35张对应JPEG，资源加载器保持逻辑路径不变并映射到本地JPEG。远程角色大图失败仍使用包内角色图。

已验证：实际构建目录经过生产 Artwork 加载器，35/35 图片加载成功（独立 Chromium，不是真机）。类型检查及相关测试通过。保留原网页素材和构图，不另行更改网页视觉主题。格式兼容问题为待手机验证的原因，未取得微信真机失败日志，不能声称已确定唯一根因。新预览码用于手机复测，不代表公网登录/语音验证通过。

重新生成兼容图片：python apps/minigame/scripts/generate-compatible-art.py（Pillow）。验证：构建后执行 node apps/minigame/scripts/verify-packaged-art.mjs；可通过 MINIGAME_PLAYWRIGHT_PATH 和 MINIGAME_CHROMIUM_PATH 指定测试运行时。
