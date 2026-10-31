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

# Preserve the web scene resolution with a high-quality local upgrade as well.
for src in (root/'apps/web/public/art/scenes').glob('*.webp'):
    Image.open(src).convert('RGB').save(hd/('scene-'+src.stem+'.jpg'),'JPEG',quality=95,optimize=True)

# Current main ships a full opaque 640x1280 palace composition.
home=root/'apps/minigame/assets/compatible/home'
home.mkdir(parents=True,exist_ok=True)
image=Image.open(root/'apps/web/public/art/home/duel-mobile.webp').convert('RGB')
image.save(hd/'home-duel.jpg','JPEG',quality=95,optimize=True)
image.thumbnail((160,320))
image.save(home/'duel-mobile.jpg','JPEG',quality=85,optimize=True)
