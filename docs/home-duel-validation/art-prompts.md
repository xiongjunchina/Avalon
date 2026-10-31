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

## 2026-10-31 高保真修订（取代上面的透明胸像素材）

参考用户确认的方案1，使用内置image_gen直接提取完整无字场景。标题、宣传句和按钮由HTML绘制。

### duel-mobile.webp

源输出：exec-1eef2aa3-16b8-4092-9059-a503fb6d80ed.png

```text
Use case: precise-object-edit. Asset type: exact MOBILE GAME HOME BACKGROUND extracted from reference approved UI image. Reproduce ONLY the CONTINUOUS BACKGROUND AND TWO CHARACTERS from this exact approved mobile image, removing EVERY letter/title/word/button/profile icon/sound badge/divider/UI. This is an artwork extraction, NOT a redesign. Preserve the close-up character scale and exact positions: golden genuine Monkey King's huge profile on LEFT edge, red false Monkey King's huge profile on RIGHT edge. Faces about x20% and80%, centers y40%, BOTH EYES/NOSE/MOUTH/CHIN clear; forehead-to-chin height each about22%-24% of total canvas height (roughly40%-45% of width). Upper chests/shoulders and plumes NATURALLY extend beyond side edges like the approved close-up. Do NOT shrink people or add margins to fit all armor/plumes; framing matches reference. Keep all expressions, likenesses, crowns, ornate armor. The two characters visually span top20% through60% of canvas, NOT tiny busts centered in a horizontal strip. Preserve GOLDEN COLUMN/GATE CORNERS on left/right, vivid blue sky in upper20%, exact dreamy golden cloud palace and distant towers between faces, natural bright cloud sea where words and buttons were, purple-blue mist only in last7%-10% at bottom. Remove title, slogan, headline and ALL controls by filling ONLY their pixels with coherent natural cloud/sky/palace extension. NO new opaque text backgrounds, no blank flat beige slab, no borders, no abstract gradient field. Full-bleed opaque scene, tall approx768x1536 (1:2) matching reference, no surrounding phone or white margin. Real HTML type/buttons are added separately. Output should look like this exact reference with all UI hidden, not a new illustration.
```

### duel-desktop.webp

源输出：exec-a382b386-26cd-4754-9a93-f635a388b9b2.png

```text
Use case: precise-object-edit. Asset type: production DESKTOP GAME HOME BACKGROUND extracted from an approved UI design. Reference is a design board: left LARGE DESKTOP panel and right narrow MOBILE panel. Work ONLY from the LEFT desktop rectangle, exclude its surrounding white board and all mobile panel. Reproduce that desktop scene's composition and character scale very faithfully, NOT a new design: two HUGE close-up opposing Monkey Kings, golden genuine Wukong on far left and red false Monkey King far right. Faces and chests dominate both sides, heads around x18% and83%, face centers y37%-42%, armor extending to y67%; gold crown and long plumes may naturally continue beyond left/top outer edge as the approved close-up framing. Keep entire eyes/nose/mouth/chin readable. Retain the SAME continuous golden cloud palace scenery with bright blue sky, ornate golden gate corners/columns at the two outer sides, distant towers at center, golden clouds lower portion and soft blue-purple mist only at bottom. Main scene should fill the WHOLE image, no floating small chest figurines or transparent cutouts. IMPORTANT: REMOVE ALL UI and ALL TEXT: title, slogan, body words, profile badge, sound badge, mode selector, all buttons, dividers and bottom links. Fill removed areas with natural CONTINUOUS original scene, preserving remaining composition exactly. Keep natural quiet blue sky top center (y7%-24%) for real HTML title; quiet bright palace/cloud center(y25%-43%) for real HTML hook and supporting line; cloudy lower center(y64%-94%) for real HTML controls. NO opaque cream/colored text slabs. NO text/letters/logos/controls, NO frame around whole image, NO image inside a tablet or browser. Output one opaque landscape background around1536x1080, roughly10:7, preserving both very large profiles exactly as approved. NOT a whole UI screenshot. Full-bleed scene only.
```

## 2026-10-31 人物边缘融合修订

在上一版已确认全幅场景上用内置image_gen局部重光／边缘融合：削弱红发荧光描边，以细碎发梢、暖金环境散射和轻薄雾气过渡；五官、眼睛、头冠、主体发束保留清晰，未添加整图CSS模糊，未更改布局和文字。图像版本改为edge-blend-3，避免缓存继续使用旧图。

### duel-mobile.webp

源输出：exec-bf80d0c7-59d7-4b9a-a5cd-b56aa5fb3ef8.png；发布尺寸保持原样。

```text
Use case: precise-object-edit / compositing. Edit THIS exact existing game-home MOBILE background, retaining EXACT layout, character identities, pose, expression, size, facial anatomy, all scene buildings/columns and camera framing. This is LOCAL EDGE AND LIGHTING RETOUCH ONLY, not a new composition. Keep same tall1:2 aspect. The red false Monkey King on right currently has an unnaturally razor-sharp saturated neon-red hair contour pasted against blue/gold sky. Make him feel photographed/painted IN the same golden cloud atmosphere: remove the continuous neon red fringe on the hair silhouette, keep the dark crimson hair mass and red identity, but taper individual outermost hair wisps softly into the nearby sky using delicate semi-transparent warm airborne mist and physically plausible reflected amber sunlight. Reduce ONLY the over-saturated very outer red rim, not the face or all red hair. Use a very narrow irregular feathered transition (about3-7 pixels at640px width), varied stray hairs, and a tiny shared warm atmosphere/light spill where hair meets sky. No white outline, no glow sticker halo, no giant haze patch, no uniform gaussian blur. Slightly soften outer fur/plume/shoulder edges of left golden Monkey King too, blending shoulder edges into existing cloud wisps; preserve crowns, hair strands, armor engraving and especially both eyes/nose/mouth absolutely sharp. Preserve contrast and center sky/palaces. No haze across faces, no ghosted/translucent facial features, no dissolve of heads. KEEP exact enlarged close-up silhouettes and all original positions. No new objects/text/UI/frame/buttons, no global color grade or washed out scene, no image-wide blur. Output the same full opaque mobile scene, only the unnatural pasted edges harmonized.
```

### duel-desktop.webp

源输出：exec-e6c356da-ee6f-4811-bc38-c833214cc205.png；发布尺寸保持原样。

```text
Use case: precise-object-edit / compositing. LOCAL EDGE-INTEGRATION RETOUCH of THIS exact existing DESKTOP fantasy game-home background. Do NOT redesign, move, resize or redraw the two characters, facial expressions, crowns, poses, clouds, golden gate corners, palace towers, or camera framing. Keep same landscape aspect approximately1280:901. Main request: the right false Monkey King's crimson flame hair currently has a sharp neon-red pasted-on silhouette against the bright sky. Keep recognizable dark crimson hair and energetic shape but remove the continuous electric red halo and soften ONLY the outermost edge wisps, with natural feathering and delicate shared golden atmospheric light/mist from the surrounding cloud world. Narrow irregular transition (equivalent4-10 pixels at1280 width), fine hairs fading softly into background, restrained amber rim reflections and soft sky-color scatter, no white halo or glowing sticker outline. Right shoulder and neck silhouette should subtly join the existing cloud atmosphere without hard cutout contour. Apply similarly subtle edge integration to left Monkey King's outer fur/armor/plumes, keeping fur/crown detail crisp. Faces, eyes, brows, mouth, armor engraving and main hair masses must stay SHARP and fully opaque; do NOT blur or cover faces. Do not lower whole image contrast or mute all red; no large translucent veil, no image-wide blur, no fog wall, no new objects or UI/text. Preserve exact huge side-profile scale and central empty text area. Output same full opaque scene with locally harmonized edge lighting and feathered extremities.
```

发布压缩仍为WebP quality60／effort6：手机640×1280为73,070B；电脑1280×901为145,196B。原始PNG不发布。

