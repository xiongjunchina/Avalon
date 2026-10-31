# 入口封面：按确认稿重建（2026-10-31）

使用内置image_gen，唯一构图依据为已确认的 `exec-4a26c9ff-d439-48be-ae65-7894cfa6c0d8.png`。人物近景比例优先，外侧肩部／发梢沿用设计稿的取景；不再以“完整小胸像＋大透明边界”替代近景。所有文字、CTA、卷轴/案卷边框由真实HTML/CSS绘制。

以下为实际采用的生成要求。统一前缀：Use case: precise-object-edit. Asset type: production game portal illustration background. Reference is the exact USER-APPROVED desktop+phone design, fidelity to its composition is the top requirement.

## avalon-mobile.webp

生成输出：exec-a023dabb-cfdd-466e-a5d1-141a0b44cf1e.png，原始PNG保留在本机，不进入网站。

```text
Extract/recreate ONLY the TOP GAME CARD from the PHONE at RIGHT of reference. Output a single SQUARE 1024x1024 art background, no phone/body/frame. Preserve exactly that card's gold/blue genuine Sun Wukong on left and red false Monkey King on right, LARGE FACE-TO-FACE CLOSE-UP portraits across its TOP HALF, faces same recognizable likeness and costumes. Match their scale to reference: face forehead-to-chin about25% of CARD WIDTH, not tiny complete busts. Both eyes/faces must be completely visible. Crown/hair may be naturally out of top/outer frame as in reference. Bottom HALF continues same glowing golden cloud palace scenery for real HTML title/copy/metadata/button. Keep real detailed cloud/towers behind future text, no flat cream slab. REMOVE ALL LETTERS, LOGOS, WORDS, NUMBERS, TITLES, BUTTONS, decorative FRAME, ROLLERS and all UI. Do NOT move/shrink people to fit complete shoulders/plumes; edge cropping is intentional CLOSE-UP photography. Full continuous scenic image with a naturally calm lower half, not a white or beige rectangle.
```

## avalon-desktop.webp

生成输出：exec-90e2662d-af2c-4155-b5fe-62ce450b5ee5.png，原始PNG保留在本机，不进入网站。

```text
Extract/recreate ONLY the TOP WIDE DESKTOP GAME BANNER from LEFT of reference. Output a single3:1 wide art background1536x512. Preserve its two MASSIVE facing Monkey King close-up upper-body portraits on RIGHT60%: genuine gold/blue left at x58%, red false Monkey right at x87%; exact approved likeness and costumes. Faces are large and clearly visible, not miniature complete floating busts. LEFT40% is continuous luminous golden cloud sea and distant palace scenery with low-contrast detail for dark real HTML text, no figures, foreground objects or text. Preserve native sky-blue/golden glow, huge sweeping palace cloud scenery. Remove ALL text/logos/buttons/numbers/decorative FRAME/SCROLL ROLLERS. No UI. No large opaque cream/white/beige slab. Keep the exact original right-side character scale; outer shoulders/crown tips can extend naturally beyond edges as reference, but eyes and entire face fully visible.
```

## mafia-mobile.webp

生成输出：exec-ec0ab2c1-2b7e-47df-ab68-47c063fe4ea6.png，原始PNG保留在本机，不进入网站。

```text
Extract/recreate ONLY the LOWER GAME CARD from PHONE at RIGHT of reference. Output ONE SQUARE1024x1024 scene background, no phone/frame. Preserve exact original three realistic noir protagonists, short-haired female detective LEFT, dark-haired black-coat killer CENTER, glasses civilian RIGHT, same faces/clothes, arranged LARGE across TOP53% over rainy nighttime European harbor, moon, amber lamps and wet reflections. Maintain original reference card scale: three portrait heads about20%-24% of card width and upper torsos clearly present. Do not make tiny complete bodies. Bottom47% continuous naturally dark navy/ink-teal wet harbor reflections and old buildings for real white HTML text/button, visible scenery no opaque rectangle/text panel. REMOVE all letters, title, words, numbers, logos, button, paperclips, border, all UI. Original faces fully visible and safe inside frame (hair can be naturally near edge), not arbitrarily clipped by art dimensions. Match reference precisely, not a new composition.
```

## mafia-desktop.webp

生成输出：exec-43f27c25-f2e8-481f-9cbb-a4f36cc36ad4.png，原始PNG保留在本机，不进入网站。

```text
Extract/recreate ONLY LOWER WIDE DESKTOP GAME BANNER from LEFT of reference. Output ONE3:1 wide art background1536x512, not complete web mockup. Exact original three realistic noir protagonists stand large on RIGHT60%: short-haired woman detective at x55%, dark-haired killer at x74%, glasses civilian at x90%, same likeness/clothes. Large heads and torsos, original scale like reference. LEFT40% quiet naturally DARK navy/ink-teal continuous nighttime harbor and wet streets for real white HTML text, no people/foreground lit lamps in left. Amber lamps and old buildings and moon connect scene behind people; no opaque panel. REMOVE ALL lettering/title/words/numbers/buttons/frames/paperclips/UI. Not tiny floating busts. Heads entirely visible; shoulders may crop outside canvas naturally.
```

## tabletop.webp

输出：exec-2c48033f-a4d6-4777-8603-6d1f330daf24.png。

```text
Use case: background-extraction. Production BACKGROUND TEXTURE ONLY for the approved game-portal website. Reference is the approved desktop+phone UI. Recreate ONLY the dark ink teal tabletop background visible OUTSIDE AND ABOVE the two desktop game cards. Wide1536x1024 dark teal cloth/leather tabletop, restrained embossed ancient decorative pattern, partially visible old maps / small bound parchment sheets at top-right and bottom-right, diagonal fountain pen near top-right perimeter. All props subtle and dark, centered area mostly clean naturally textured tabletop. No game cards, no people, no monkeys, no text, no labels, no letters/numbers, no buttons, no phone, no frame, no glowing gradients. Same original material and mood as reference. This is not a complete interface. Keep low contrast and highly compressible texture so it remains background; no excessive fine high-contrast noise.
```

四张封面按640px／1280px宽等比缩小为WebP quality60／effort6；桌面纹理按960px宽WebP quality42。只发布这些低体积版本，原PNG与本记录不随页面下载。
