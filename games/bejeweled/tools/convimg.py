#!/usr/bin/env python3
"""Convert PopCap image resources (color .jp2/.jpg/.png/.gif + optional '<name>_.gif' alpha) to PNG.

PopCap stores many images as a colour file plus a separate 8-bit alpha mask
named with a trailing underscore. If only the alpha mask exists the colour is white.
"""
import os, subprocess, sys, tempfile
from PIL import Image

COLOR_EXTS = ('.jp2', '.jpg', '.png', '.gif')

def find(base):
    color = next((base + e for e in COLOR_EXTS if os.path.exists(base + e)), None)
    alpha = base + '_.gif' if os.path.exists(base + '_.gif') else None
    return color, alpha

def load(path):
    if path.endswith('.jp2'):
        fd, tmp = tempfile.mkstemp(suffix='.png'); os.close(fd)
        subprocess.run(['opj_decompress', '-i', path, '-o', tmp, '-quiet'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        im = Image.open(tmp); im.load(); os.remove(tmp)
        return im
    im = Image.open(path); im.load()
    return im

def convert(base, out):
    color, alpha = find(base)
    if not color and not alpha:
        return False
    if color:
        im = load(color)
        if im.mode == 'P' or im.mode == 'L':
            im = im.convert('RGBA') if 'transparency' in im.info else im.convert('RGB')
        im = im.convert('RGBA') if im.mode != 'RGBA' else im
    if alpha:
        a = Image.open(alpha).convert('L')
        if not color:
            im = Image.new('RGBA', a.size, (255, 255, 255, 255))
        if a.size != im.size:
            a = a.resize(im.size)
        im.putalpha(a)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=False, compress_level=6)
    return True

if __name__ == '__main__':
    print(convert(sys.argv[1], sys.argv[2]))
