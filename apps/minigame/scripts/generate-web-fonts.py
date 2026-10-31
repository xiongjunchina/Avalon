"""Regenerate the web font subsets used by the native Canvas homepage/table.
Development-only: requires fonttools; no runtime font network dependency.
Fonts are from Google Fonts under SIL OFL; licenses ship beside the TTFs.
"""
from pathlib import Path
import urllib.request, urllib.parse, re, json, hashlib, io, sys
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[3]
sources = [str(p.relative_to(root)) for p in (root/'apps/minigame/src').rglob('*.ts')] + ['apps/web/src/roles.ts','apps/web/src/identity-presentation.ts','apps/web/src/role-descriptions.ts','apps/web/src/game-presentation.ts']
chars = ''.join(sorted(set(''.join((root / x).read_text(encoding='utf-8') for x in sources))))
chars = ''.join(c for c in chars if '\u3400' <= c <= '\u9fff' or 32 <= ord(c) < 127 or 0x3000 <= ord(c) <= 0x303f or 0xff00 <= ord(c) <= 0xffef or 0x2000 <= ord(c) <= 0x206f)
out = root / 'apps/minigame/assets/fonts'
out.mkdir(parents=True, exist_ok=True)
offline='--offline' in sys.argv
previous={r['file']:r for r in json.loads((out/'source.json').read_text(encoding='utf-8'))} if (out/'source.json').exists() else {}
records = []
for name, family, directory in [('calligraphy', 'Ma Shan Zheng', 'mashanzheng'), ('display', 'ZCOOL XiaoWei', 'zcoolxiaowei'), ('sans', 'Noto Sans SC', 'notosanssc'),('sans500','Noto Sans SC:wght@500','notosanssc'),('sans600','Noto Sans SC:wght@600','notosanssc'),('sans700','Noto Sans SC:wght@700','notosanssc')]:
    css_url = 'https://fonts.googleapis.com/css2?' + urllib.parse.urlencode({'family': family})
    if offline:
        url=previous[name+'.ttf']['source']
    else:
        css = urllib.request.urlopen(css_url, timeout=30).read().decode()
        url = re.search(r'url\(([^)]+)\)', css).group(1)
    cache = root / 'dist/font-sources'
    cache.mkdir(parents=True, exist_ok=True)
    cached = cache / (name + '.ttf')
    if offline and not cached.exists(): raise FileNotFoundError('Offline font source missing: '+str(cached))
    data = cached.read_bytes() if cached.exists() else urllib.request.urlopen(url, timeout=30).read()
    cached.write_bytes(data)
    if data[:4] != b'\x00\x01\x00\x00':
        raise ValueError('Expected TrueType font')
    font = TTFont(io.BytesIO(data))
    options = subset.Options()
    options.layout_features = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.save(buffer)
    data = buffer.getvalue()
    destination=out if name in ['sans','display','calligraphy'] else root/'apps/minigame/assets/web-fonts'
    destination.mkdir(parents=True,exist_ok=True)
    (destination / (name + '.ttf')).write_bytes(data)
    license_url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/' + directory + '/OFL.txt'
    license_text = (destination/(name+'-OFL.txt')).read_text(encoding='utf-8') if offline else urllib.request.urlopen(license_url, timeout=30).read().decode('utf-8')
    (destination / (name + '-OFL.txt')).write_text('\n'.join(line.rstrip() for line in license_text.splitlines()) + '\n', encoding='utf-8')
    records.append({'file': name + '.ttf', 'family': family, 'source': url, 'sha256': hashlib.sha256(data).hexdigest(), 'glyphs': len(chars), 'bytes': len(data)})
(out / 'source.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print('Web font subsets generated:', sum(r['bytes'] for r in records), 'bytes')

# Preserve the current homepage's static 650 interface font exactly.
home_font=TTFont(root/'apps/web/public/art/home/fonts/home-interface.woff2')
home_font.flavor=None
home_font.save(root/'apps/minigame/assets/web-fonts/homeInterface.ttf')
(root/'apps/minigame/assets/web-fonts/homeInterface-OFL.txt').write_text('\n'.join(line.rstrip() for line in (root/'apps/web/public/art/home/fonts/interface-OFL.txt').read_text(encoding='utf-8').splitlines())+'\n',encoding='utf-8')
