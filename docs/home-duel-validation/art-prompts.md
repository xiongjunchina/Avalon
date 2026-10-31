# 首页对峙素材生成记录

使用内置 image_gen；参考用户确认的方案 1 效果图，将人物与 HTML 文案／控件分开。两份最终素材保持透明，融入既有天宫背景。以下为最终采用的提示词，原始 PNG 不加入网站。

## duel-mobile.webp

生成输出：exec-aacad8cd-48b8-4b52-b9d1-5462de0e27e4.png。

```text
Use case: precise-object-edit / background-extraction. Edit reference1 into a properly bounded TRANSPARENT PNG foreground for a website. Keep exact two monkey likenesses, blue-and-gold genuine Monkey King on LEFT and red false Monkey King RIGHT, facing each other, same detailed armor/crowns. Critical correction: the entire two figures must be scaled DOWN to 70% of present size, with at least8% completely TRANSPARENT empty margin at left/right/top/bottom. Reconstruct the currently clipped plume tip / shoulder so every long golden plume, crown, red hair tip, shoulder and upper chest is fully contained in canvas. COMPLETE subjects floating inside the frame, NOT extending beyond any edge. Use 3:2 horizontal canvas, approx1536x1024. Left occupies x8%-43%, right x57%-92%, middle gap transparent. The alpha background MUST be fully transparent everywhere outside the two subjects and a few lower chest cloud wisps. Absolutely NO colored backdrop, no solid gold/red/black/white/gray background, no glow rectangle, no checkerboard baked into pixels. No text/title/buttons/palaces/frame or scenery. Do not enlarge faces to fill canvas. Transparent breathing room matters more than size.
```

## duel-desktop.webp

生成输出：exec-671014ef-5bbf-4c02-a3a7-43f4243ad644.png。

```text
Use case: precise-object-edit / background-extraction. Reference1 is the transparent WIDE DESKTOP duo to correct. Output a TRUE ALPHA transparent PNG with VERY WIDE 2:1 canvas (about1800x900). Preserve exact likeness and costumes, facing each other, gold genuine Sun Wukong left and red false Monkey King right. Preserve the large EMPTY CENTER from reference1. Important: make EACH figure 20% SMALLER and reposition left figure into LEFT 27% (x5%-30%) and right figure into RIGHT27% (x70%-95%), with a completely TRANSPARENT central40% from x30%-70% from TOP TO BOTTOM. Entire gold crown, COMPLETE two long plumes, red hair tips, head, shoulders and upper chest must fit inside image. Rebuild any cropped plume or shoulder instead of leaving a straight crop edge; at least5% transparent margins all4 sides, including plume tip and cloud wisps. NO background colors, NO sky/palace/pillars; actual transparent alpha all outside figures and a few bottom cloud wisps only. No backdrop glow rectangle, no text, no words, no title or buttons, no frame, no fake checkerboard. Do not fill the center gap with figures. It is intentional empty space reserved for real HTML text. Keep2:1 wide aspect, NOT a square or3:2.
```

发布格式为 WebP quality60、alphaQuality75、effort6；整图按宽640px／1280px缩小，不裁切，不发布高DPR或原始超清版本。手机59,576B，电脑128,508B。浏览器按760px断点只下载一份图片；桌面素材保留更宽的中央空位，手机素材将两人靠近。未采用的试稿不进入发布目录。

