#!/usr/bin/env python3
"""
Downloads the seamless textures from tutorialsforblender3d.com (royalty-free,
for commercial and noncommercial use) into public/textures/<category>/<key>.webp
and writes the list in shared/textures.ts. Files that are already there are
skipped, and it goes slowly: the site starts sending 1x1 placeholders when it
gets too many requests, and then this stops (run it again later).

    python3 tools/fetch_textures.py
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

BASE = 'https://tutorialsforblender3d.com/Textures/'
OUT = 'public/textures'
LIST = 'shared/textures.ts'
DELAY = 4  # seconds between downloads
# Category, its Dutch name, and its first gallery page (normal maps, sky boxes and single leaves are left out)
CATEGORIES = [
    ('bricks', 'Bakstenen', 'Bricks/Bricks_Rendered_1.html'),
    ('stone', 'Steen', 'Stone/Stone_Rendered_1.html'),
    ('wall', 'Muren & vloeren', 'Wall/Wall_Rendered_1.html'),
    ('tile', 'Tegels', 'Tile/Tile_Rendered_1.html'),
    ('marble', 'Marmer', 'Marble/Marble_Rendered_1.html'),
    ('wood', 'Houten planken', 'Wood-Boards/WoodBoards_Rendered_1.html'),
    ('metal', 'Metaal', 'Metal/Metal_Rendered_1.html'),
    ('tarnished', 'Oud metaal', 'Metal-Tarnished/Tarnished_Rendered_1.html'),
    ('grass', 'Gras', 'Grass/Grass_1.html'),
]


def get(url, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
    return data if binary else data.decode('latin-1')


def files_of(first):
    folder, page = first.split('/')
    html = get(BASE + first)
    pages = [page] + sorted(set(re.findall(r'href="([A-Za-z_]+_\d+\.html)"', html)) - {page})
    files = []
    for p in pages:
        h = html if p == page else get(f'{BASE}{folder}/{p}')
        for href in re.findall(r'href="(?:/Textures/[^/]+/)?((?:Textured|textures)/[^"]+\.(?:png|jpg))"', h, re.I):
            if href not in files:
                files.append(href)
        time.sleep(1)
    return folder, files


def key_and_name(file):
    stem = re.sub(r'\.(png|jpg)$', '', file.split('/')[-1], flags=re.I)
    key = re.sub(r'[^a-z0-9]+', '-', re.sub(r'(?<=[a-z])(?=[A-Z0-9])', '-', stem).lower()).strip('-')
    return key, re.sub(r'(?<=[a-z])(?=[A-Z0-9])', ' ', stem).replace('_', ' ')


def main():
    names = {}
    blocked = False
    for cat, _, first in CATEGORIES:
        folder, files = files_of(first)
        os.makedirs(f'{OUT}/{cat}', exist_ok=True)
        names[cat] = {}
        for f in files:
            key, name = key_and_name(f)
            names[cat][key] = name
            dest = f'{OUT}/{cat}/{key}.webp'
            if os.path.exists(dest) or blocked:
                continue
            img = Image.open(io.BytesIO(get(f'{BASE}{folder}/{f}', True))).convert('RGB')
            if img.width < 16:
                print('The site sends placeholders now; try again later.')
                blocked = True
                continue
            if img.width > 256:
                img = img.resize((256, 256), Image.LANCZOS)
            img.save(dest, 'WEBP', quality=80, method=6)
            print('saved', dest)
            time.sleep(DELAY)
    write_list(names)


def write_list(names):
    """Only the textures that are really there go in the list."""
    src = open(LIST).read()
    rows = []
    for cat, _, _ in CATEGORIES:
        rows.append(f'  {cat}: [')
        for key, name in names[cat].items():
            if os.path.exists(f'{OUT}/{cat}/{key}.webp'):
                rows.append(f"    ['{key}', '{name}'],".replace("'s ", "\\'s "))
        rows.append('  ],')
    start = src.index('= {\n', src.index('export const TEXTURES: Record')) + 4
    end = src.index('\n}\n', start)
    open(LIST, 'w').write(src[:start] + '\n'.join(rows) + src[end:])
    print('list:', sum(len(v) for v in names.values()), 'found,', sum(len(os.listdir(f'{OUT}/{c}')) for c, _, _ in CATEGORIES), 'on disk')


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    sys.exit(main())
