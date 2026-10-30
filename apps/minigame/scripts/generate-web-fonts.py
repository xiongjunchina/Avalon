"""Regenerate the web font subsets used by the native Canvas homepage/table.
Development-only: requires fonttools; no runtime font network dependency.
Fonts are from Google Fonts under SIL OFL; licenses ship beside the TTFs.
"""
from pathlib import Path
import urllib.request, urllib.parse, re, json, hashlib, io
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[3]
sources = [str(p.relative_to(root)) for p in (root/'apps/minigame/src').rglob('*.ts')] + ['apps/web/src/roles.ts','apps/web/src/identity-presentation.ts','apps/web/src/role-descriptions.ts','apps/web/src/game-presentation.ts']
chars = ''.join(sorted(set(''.join((root / x).read_text(encoding='utf-8') for x in sources))))
chars = ''.join(c for c in chars if '\u3400' <= c <= '\u9fff' or 32 <= ord(c) < 127)
out = root / 'apps/minigame/assets/fonts'
out.mkdir(parents=True, exist_ok=True)
records = []
for name, family, directory in [('calligraphy', 'Ma Shan Zheng', 'mashanzheng'), ('display', 'ZCOOL XiaoWei', 'zcoolxiaowei'), ('sans', 'Noto Sans SC', 'notosanssc')]:
    css_url = 'https://fonts.googleapis.com/css2?' + urllib.parse.urlencode({'family': family})
    css = urllib.request.urlopen(css_url, timeout=30).read().decode()
    url = re.search(r'url\(([^)]+)\)', css).group(1)
    cache = root / 'dist/font-sources'
    cache.mkdir(parents=True, exist_ok=True)
    cached = cache / (name + '.ttf')
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
    (out / (name + '.ttf')).write_bytes(data)
    license_url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/' + directory + '/OFL.txt'
    license_text = urllib.request.urlopen(license_url, timeout=30).read().decode('utf-8')
    (out / (name + '-OFL.txt')).write_text('\n'.join(line.rstrip() for line in license_text.splitlines()) + '\n', encoding='utf-8')
    records.append({'file': name + '.ttf', 'family': family, 'source': url, 'sha256': hashlib.sha256(data).hexdigest(), 'glyphs': len(chars), 'bytes': len(data)})
(out / 'source.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print('Web font subsets generated:', sum(r['bytes'] for r in records), 'bytes')
