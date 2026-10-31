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

## 人物边缘与场景融合修订（2026-10-31）

使用内置 image_gen 对当前已批准的四张完整场景进行边缘与环境光局部编辑。构图、人物大近景比例和字区保持；脸部、眼睛、头冠、主要发丝不做整体模糊。红发外侧荧红尖边改为带暖金散射的自然发梢过渡，肩甲衔接原有云雾。暗局只加入轻微湿雾／环境反光，不洗白夜景。生成编辑并非逐像素滤镜，局部发丝、云滴和衣纹有少量重绘，未观察到明显身份或构图漂移。

### avalon-mobile.webp

源 PNG：/Users/xjun/.codex/generated_images/01a19064-d974-7732-85a1-73b97599368a/exec-02a79c17-fa00-45fb-848b-6bab757dfe41.png

```text
Use case: precise-object-edit / lighting-weather. This is a LOCAL EDGE INTEGRATION RETOUCH of the EXACT existing approved square game portal artwork. Do not recompose or redesign it. Keep both faces, gaze, expression, armor, crowns, close-up scale, positions and every palace/cloud/sky landmark unchanged. Retouch ONLY the narrow transition where the two characters' hair and outer shoulder armor meet the scenery. The right red-haired false Monkey King currently has a hard fluorescent-crimson cutout silhouette: soften ONLY outermost flyaway tips into the nearby sky with a delicate translucent golden atmospheric veil, subtle warm sunlight light-wrap and a few naturally fading individual hair strands. Slightly neutralize the harsh neon red fringe toward the scene's warm red-gold reflected light while retaining deep red hair and all sharply readable main hair strands. Both characters' outer shoulders should blend into existing golden cloud haze with soft intermittent lost-and-found contours. Preserve eyes, brows, noses, mouths, skin detail, crown ornaments, central hair masses and armor detail SHARP. Do NOT blur whole image or faces, do NOT make the characters pale ghosts or transparent, do NOT add a uniform bright halo or outline. Transition should be narrow and organic, around 4-10px at640px output, not a big fog patch; no mist over eyes or future text area. Preserve exact original color balance elsewhere, original composition and square aspect. No text, UI, new figures, structures, props, frames or extra flame shapes. Output same continuous opaque scene with only more natural edge and ambient-light integration.
```

### avalon-desktop.webp

源 PNG：/Users/xjun/.codex/generated_images/01a19064-d974-7732-85a1-73b97599368a/exec-b881ab5a-b785-4ee1-ae2f-8761ff96de2d.png

```text
Use case: precise-object-edit / lighting-weather. Retouch the narrow CHARACTER-TO-BACKGROUND EDGE TRANSITIONS ONLY in this exact approved3:1 game banner. Keep original left40% scenic text-negative-space, two large facing Monkey King profiles on right, all facial identity/expression/eye direction/crowns/armor/pose/scale/coordinates and all palace/sky/cloud architecture unchanged. Do not reframe, crop, move or shrink people. Main problem: red false Monkey King's crimson hair looks pasted onto the blue/gold scenery. Give ONLY the outer flyaway red hair fringe a soft atmospheric lost-and-found transition into nearby sunlit sky: subtle warm golden light-wrap, small natural reflected amber on hair edges, extremely light translucent cloud/air haze between stray tips. Retain the red character's signature deep red hair and sharp main strands, reduce only the harsh neon red outline / overly crisp outer fringe. Blend outer shoulders of both characters into existing golden cloud atmosphere with intermittent soft wisps and matched reflected light. The transition width should be narrow, around6-14px at1280px output; not an airbrushed halo or fog wall. Keep both faces and eyes and crowns fully SHARP and readable, no face/body blur, no whitening of whole image, no faded ghosts, no double outlines. Preserve original scene contrast and exact large close-up composition. No text/logos/buttons/UI/frame/new elements. Same3:1 wide continuous opaque scene, production background only.
```

### 暗局两张局部融合

使用内置 image_gen，对当前已批准完整场景进行局部编辑；没有重新设计角色或页面构图。只发布原尺寸 WebP quality60／effort6；Sharp仅用于等比格式/尺寸适配和压缩，不用于内容编辑。

#### mafia-mobile.webp

原PNG：/Users/xjun/.codex/generated_images/01a19066-888d-75f3-abeb-bbc7b05c98be/exec-652a8424-c95e-428d-9907-efb766c2ab5c.png

```text
Use case: precise-object-edit / lighting-weather. Edit the supplied COMPLETE approved game-portal scene with an extremely subtle edge-integration pass ONLY. Keep exact square composition, original three protagonist identities, face shapes, expressions, gaze directions, clothes, pose, scale and positions; keep all background buildings, moon, lamps, reflections and rainy harbor geometry unchanged. This is NOT a redesign or a new rendering. ONLY soften the unnaturally crisp hair/coat/shoulder silhouette boundaries with a narrow, natural transition into the existing rainy night atmosphere: faint cool moonlight scattering, restrained amber lamp color reflected on edge strands, and tiny wisps of wet harbor air touching outer coat edges. Preserve sharply resolved eyes, facial features, glasses, main hair strands and costume texture. No blur on faces, no generalized Gaussian blur, no milky fog veil, no enlarged glow halo, no white outlines, no duplicate/ghost silhouette. Keep the naturally dark, high-contrast navy night scene and warm reflections. Retain the existing lower portrait-to-harbor dissolve but make it slightly more organic without expanding upward across faces or into the bottom text space. No new objects, no text, no UI, no frame. Output a single opaque SQUARE image matching reference framing exactly, about1024x1024.
```

#### mafia-desktop.webp

原PNG：/Users/xjun/.codex/generated_images/01a19066-888d-75f3-abeb-bbc7b05c98be/exec-1e9809cc-5458-4b21-a847-e7e028f42fc3.png

```text
Use case: precise-object-edit / lighting-weather. Perform ONLY a very subtle edge-integration pass on the supplied approved WIDE DESKTOP game-portal illustration. Exact3:1 landscape framing must remain, three characters retain precisely the same size and positions on the right, empty dark harbor scenery on left remains exactly the same. LOCK identities/face shapes/expressions/gaze/glasses/clothes/hands/poses, and all moon/buildings/lamps/water/reflections. Do not redesign or change composition. The only intended edit is narrow silhouette transition: lightly soften the too-hard outer hair and coat/shoulder edges into the existing rainy atmosphere, using very faint cool moonlit air and subtle warm amber environmental light on edge strands and fabric. Preserve original main strands, eyes and facial features SHARP. No whole-image blur, no facial blur, no milky fog blanket, no white feathered contour, no glow halo, no transparent ghosts or duplicate edges. Character outlines remain recognizable and strong, but feel photographed within this same rainy harbor rather than cut-and-pasted. Keep naturally dark navy tones and restrained bright lamps; do not wash out the scene. No new objects/text/UI/frame. Output one OPAQUE very wide1536x512 (3:1) image, matching reference crop exactly.
```

发布体积：mafia-mobile.webp 为640×640、86,644B；mafia-desktop.webp 为1280×427、74,280B。两图均无透明通道、无附加UI或文字，未增加超清版本。原图备份位于/private/tmp/mafia-mobile-before-edge-blend.webp和mafia-desktop-before-edge-blend.webp。

视觉复核：脸部／眼睛／眼镜／主要发丝仍清晰；保持原三人位置和比例、雨夜明暗与下方文字场景，轮廓边缘稍有湿雾和环境反光衔接，手机胸口过渡更细碎，未加大雾墙或出现脸部透景。生成编辑不可保证逐像素不变，局部衣纹和雨滴有少量变化，未观察到明显角色身份或布局漂移。


四图最终发布规格（WebP quality60、effort6）：

| 文件 | 尺寸 | 字节 |
| --- | --- | ---: |
| avalon-mobile.webp | 640×640 | 63,148 |
| avalon-desktop.webp | 1280×427 | 81,994 |
| mafia-mobile.webp | 640×640 | 86,644 |
| mafia-desktop.webp | 1280×427 | 74,280 |

手机两图149,792B，电脑两图156,274B，均在原300KB／400KB预算内；没有发布原始PNG或更高DPR版本。Sharp仅用于尺寸适配和压缩，未用于图像内容编辑。本轮未改页面CSS、HTML生成器、文案或业务流程。
