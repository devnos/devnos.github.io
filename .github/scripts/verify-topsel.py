"""Validate the static Pages artifact using only Python's standard library."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import hashlib
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else 'topsel-school').resolve()
BASE = '/topsel-school/'
CANONICAL = 'https://devnos.github.io/topsel-school/'

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.meta = {}
        self.ids = set()
        self.anchors = []
        self.assets = []
        self.canonical = None
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append(tag)
        if a.get('id'):
            self.ids.add(a['id'])
        if tag == 'meta':
            self.meta[a.get('property', a.get('name', ''))] = a.get('content', '')
        if tag == 'a':
            self.anchors.append(a.get('href', ''))
        if tag == 'script':
            self.scripts.append(a.get('type', ''))
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')
        if tag == 'link' and a.get('rel') in ['stylesheet', 'icon']:
            self.assets.append(a['href'])
        if tag == 'img':
            assert a.get('alt'), 'Image must have alternative text'
            self.assets.append(a['src'])
            self.assets.extend(part.strip().split()[0] for part in (a.get('srcset') or '').split(',') if part.strip())

html = (ROOT / 'index.html').read_text()
p = Page()
p.feed(html)
assert p.tags.count('h1') == 1
assert p.tags.count('form') == 0
assert p.scripts == ['application/ld+json']
assert p.canonical == CANONICAL
assert p.meta['og:url'] == CANONICAL
assert p.meta['og:image'] == CANONICAL + 'og-image.jpg'
assert p.meta['twitter:image'] == p.meta['og:image']
assert p.meta['og:image:width'] == '1200' and p.meta['og:image:height'] == '630'
assert p.meta['description'] and p.meta['og:title'] and p.meta['twitter:card'] == 'summary_large_image'
assert 'noindex' not in p.meta['robots']
assert p.anchors.count('https://payform.ru/5rcZIdQ/') == 1
assert not any('t.me' in href for href in p.anchors)
for href in p.anchors:
    if href.startswith('#'):
        assert href[1:] in p.ids, f'Missing fragment target: {href}'
for url in p.assets:
    path = urlparse(url).path
    assert path.startswith(BASE), f'Asset escaped Pages base: {path}'
    local = (ROOT / path[len(BASE):]).resolve()
    assert local.is_relative_to(ROOT) and local.is_file(), f'Missing asset: {url}'
for css in (ROOT / '_astro').glob('*.css'):
    for raw in re.findall(r'url\(([^)]+)\)', css.read_text()):
        url = raw.strip(' \"\'')
        if url.startswith('data:'):
            continue
        path = urlparse(url).path
        local = ROOT / path[len(BASE):] if path.startswith(BASE) else css.parent / path
        assert local.resolve().is_relative_to(ROOT) and local.is_file(), f'Missing CSS asset: {url}'
assert (ROOT / 'licenses/Onest-OFL.txt').is_file()
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
assert ET.parse(ROOT / 'sitemap.xml').findtext('s:url/s:loc', namespaces=ns) == CANONICAL
image = (ROOT / 'og-image.jpg').read_bytes()
assert hashlib.sha256(image).hexdigest() == 'f8847e100b4f048688940f46cc2442593c436796ee5aa73184391494dd64ac1e'
assert image[:2] == b'\xff\xd8'
pos = 2
size = None
while pos < len(image):
    if image[pos] != 255:
        pos += 1
        continue
    marker = image[pos + 1]
    pos += 2
    length = int.from_bytes(image[pos:pos + 2], 'big')
    if marker in [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]:
        height, width = struct.unpack('>HH', image[pos + 3:pos + 7])
        size = [width, height]
        break
    pos += length
assert size == [1200, 630]
info = json.loads((ROOT / 'deploy-info.json').read_text())
assert re.fullmatch('[a-f0-9]{40}', info['source_commit'])
print(json.dumps({'status': 'passed', 'canonical': p.canonical, 'assets_checked': len(p.assets), 'og_dimensions': size, 'source_commit': info['source_commit']}))
