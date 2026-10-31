# 入口封面生成提示词

使用内置 image_gen 工具。以下记录首版四张无文字封面的提示词，以及本轮手机素材重构要求；参考图为本对话已确认的组合效果稿及现有游戏角色图。原始生成输出保留在本机，门户仅包含压缩 WebP。电脑素材继续沿用首版，手机素材以末尾修复记录为准。

## avalon-desktop

```text
Use case: compositing / game website background illustration.
Create ONE production website background ART ASSET ONLY. Wide landscape1536x512,3:1. Extract/recreate the TOP LEFT DESKTOP GAME BANNER ART from reference1 approved mockup, without ANY letters, words, numbers, logo, button, decorative UI or frame. This will be used as a full-bleed background under real HTML text. Preserve exact two protagonists from reference2 original genuine Sun Wukong and reference3 red false-monkey, standing face to face, same likeness, costumes and realistic illustration. Golden cloud palace and blue sky spread across whole image. COMPOSITION: LEFT48% must contain ONLY calm naturally bright lightly textured cloud sea and distant faint palace silhouettes, with no characters, poles, staffs, faces, bright highlights, hard architectural edges or opaque panel, reserved for real dark HTML text overlay; RIGHT52% contains both monkeys facing one another with entire faces completely inside image. Faces around x65% and87%, y42%, heads safely within top15%-70%, chest armor below. No large foreground character may enter left text area. Keep natural cloud/tower scene detail throughout left, NOT flat cream rectangle or paper wash. The user explicitly rejected solid text background slabs. Beautiful coherent scene, cinematic original art, no battle action, no extra characters, no white dragon. No text whatsoever. No surrounding portal/tabletop. No scroll border (added in HTML/CSS).
```

## avalon-mobile

```text
Use case: compositing / game website background illustration.
Create ONE production MOBILE website background ART ASSET ONLY, square800x800. Use the TOP RIGHT MOBILE GAME ART in reference1 approved mockup but REMOVE ALL text, numbers, logos, buttons and UI/frame. Original genuine Wukong from ref2 and red false-monkey ref3 face one another across top half of illustration, preserve exact likenesses and costumes. Both heads and faces fully visible, roughly centers x25% and75%, y23%, heads within top3%-45%. The lower52% of image must contain ONLY golden cloud sea and faint distant palace/tower scenery, CALM and naturally bright for real DARK HTML game title/body/button overlaid later. Do not extend bodies into the lower half reserved text area. No opaque beige/cream paper/text panel or fake blank rectangle; real softly detailed clouds/towers/sky should cover full image. No extra hero or white dragon. This is a scene with two characters, NOT a screenshot or UI design board. NO TEXT anywhere, no decorative border or scroll (added by CSS).
```

## mafia-desktop

```text
Use case: compositing / game website background illustration.
Create ONE production website background ART ASSET ONLY. Wide landscape1536x512,3:1. Recreate LOWER LEFT DESKTOP GAME BANNER ART from ref1 approved portal and exact original three people from ref2 Mafia actual homepage: short-haired detective woman, dark-haired killer man, glasses civilian man. Preserve original face likeness, clothing and realistic noir style. Set in same rainy night European harbor, wet streets, distant old buildings and amber lamps. COMPOSITION: LEFT48% scene only, naturally DARK calm navy/ink-teal harbor/water/pavement reserved for actual white HTML text; no people, faces, foreground lamps, huge lit windows or bright hard edges in this left area. RIGHT52% all three portraits group, woman left man center glasses man right, their heads completely within image top15%-70%, large recognizable faces, shoulders/chests lower. Ref1 is a visual appearance reference, NOT text to reproduce. NO TEXT, letters, titles, numbers, logos, controls or frames anywhere. NO big paper/beige slab behind text, NO opaque overlay. Full continuous rainy harbor scene visible across entire asset, dark left for readability and warm right for faces. No guns, extra detective props or extra people. Not a complete website mockup, only banner art; dossier decoration added in HTML/CSS.
```

## mafia-mobile

```text
Use case: compositing / game website background illustration.
Create ONE production MOBILE website background ART ASSET ONLY, square800x800. Take LOWER RIGHT MOBILE CARD's art atmosphere from ref1 approved mockup and original three people from ref2 Mafia homepage. Short-haired detective woman left, dark-haired killer man center, glasses civilian right, exact original face likeness/clothing/realistic noir style. All THREE faces in TOP44% of image fully visible with head centers around x22%,50%,79% and y23%; shoulders end or recede around middle. BOTTOM52% continuous rainy night European harbor/wet street/water reserved for WHITE real HTML title/body/button later, naturally DARK ink-teal/navy and calm with restrained small amber reflections. No human body/face intruding into lower text area, no bright foreground lamps there. DO NOT put paper, beige text plate, blank rectangle or opaque dark text overlay. Real harbor scene must be visible across full frame. NO TEXT anywhere, NO numbers, titles, controls, logos, frames; dossier decoration added by CSS. No guns, extra props or extra characters. ONLY art, not website mockup or phone screenshot.
```

## 手机反馈修复（2026-10-31）

首版源图的头冠长翎贴近画面边缘，再叠加 CSS 裁切，手机显示不完整。本轮使用相同工具重新构图，以下为生成要求摘要；不是通过扩大原图分辨率解决。

- **真假悟空**：沿用两人面对面的身份对峙、原角色相貌与服饰和金色云海天宫。人物缩小并向画面中间收拢，头部、头冠、两根完整长翎、肩甲和上身均留在画面内；四周保留余量。人物集中于上半部，下方保留连续自然云海供真实 HTML 文案使用。不生成文字、按钮、卷轴边框或实色文字底板。最终采用生成输出 `exec-7ba11ee5-c825-4f0b-b185-574d6f127cb2.png`，整图缩小为 **640×560**，不裁切。
- **暗局**：沿用短发女侦探、中央黑衣男子、右侧眼镜男子和雨夜雾港。三人整体缩小、留出发顶与肩部余量，完整容纳在上半部，下方保留自然深色港湾水面与灯火供文字使用。不生成文字、按钮、纸夹或实色文字底板。最终采用生成输出 `exec-e7133a4d-ef80-4d23-930e-503770b12100.png`，整图缩小为 **640×585**，不裁切。

发布时仅保留 WebP quality 60／effort 6 的640px宽版本。原始 PNG、未采用的试稿和本文件均不进入网页资源目录。
