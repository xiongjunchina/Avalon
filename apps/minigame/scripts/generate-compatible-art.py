"""Generate Mini Game JPEG counterparts from the web originals; needs Pillow."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[3]
for folder in ['scenes','roles','avatars']:
    dest=root/'apps/minigame/assets/compatible'/folder
    dest.mkdir(parents=True,exist_ok=True)
    for src in (root/'apps/web/public/art'/folder).glob('*.webp'):
        if folder=='roles' and not src.name.endswith('-160.webp'):
            continue
        Image.open(src).convert('RGB').save(dest/(src.stem+'.jpg'),'JPEG',quality=85,optimize=True)

# Large portraits ship in a separate local resource package at their original resolution.
hd=root/'apps/minigame/assets/hd-art'
hd.mkdir(parents=True,exist_ok=True)
for src in (root/'apps/web/public/art/roles').glob('*-640.webp'):
    Image.open(src).convert('RGB').save(hd/(src.stem+'.jpg'),'JPEG',quality=92,optimize=True)
