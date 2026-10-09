#!/usr/bin/env python3
"""Render one frame of a PAM sprite to PNG (debug tool for the PAM converter)."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pam
from convimg import find, load
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRACTED = os.path.join(ROOT, 'extracted')
_res = None


def resources():
    global _res
    if _res is None:
        _res = {}
        xml = open(os.path.join(EXTRACTED, 'properties', 'resources.xml'), encoding='latin-1').read()
        for m in re.finditer(r'<Image id="([^"]+)" path="([^"]+)"', xml):
            if '\\1200\\' in m.group(2) or m.group(1) not in _res:
                _res[m.group(1)] = m.group(2).replace('\\', '/')
    return _res


def image_base(pam_path, name):
    """Resolve a PAM image name ('rel\\path|IMAGE_ID') to an extracted base path (no extension)."""
    rel, _, rid = name.partition('|')
    if rid and rid in resources():
        return os.path.join(EXTRACTED, resources()[rid])
    if not rel:
        return None
    return os.path.normpath(os.path.join(os.path.dirname(pam_path), rel.replace('\\', '/')))


def load_rgba(base):
    from convimg import convert
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix='.png'); os.close(fd)
    ok = convert(base, tmp)
    im = Image.open(tmp).convert('RGBA') if ok else None
    if im: im.load()
    os.remove(tmp)
    return im


def mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)


def render(path, sprite_name, frame, out, size=None):
    p = pam.parse(open(path, 'rb').read())
    j = pam.to_json(p)
    imgs = [load_rgba(image_base(path, im['name'])) if image_base(path, im['name']) else None for im in j['images']]
    W, H = size or (int(j['size'][0]), int(j['size'][1]))
    canvas = Image.new('RGBA', (W, H), (40, 40, 60, 255))
    sprites = j['sprites']
    root = next((s for s in sprites if s['name'] == sprite_name), None) if sprite_name else j['main']

    def draw(sp, f, M, alpha):
        frames = sp['frames']
        objs = frames[min(f, len(frames) - 1)]
        for o in objs:
            kind, res, a, b, c, d, tx, ty, cr, cg, cb, ca, start, add = o
            m = mul(M, (a, b, c, d, tx, ty))
            if kind == 1:
                child = sprites[res]
                n = len(child['frames'])
                draw(child, (f - start) % n if n else 0, m, alpha * ca)
            else:
                im = imgs[res]
                if im is None:
                    continue
                t = j['images'][res]['t']
                mm = mul(m, tuple(t))
                w, h = j['images'][res]['w'] or im.width, j['images'][res]['h'] or im.height
                if (w, h) != im.size:
                    im = im.resize((max(1, int(w)), max(1, int(h))))
                # inverse affine for PIL
                A, B, C, D, E, F = mm
                det = A * D - B * C
                if abs(det) < 1e-9:
                    continue
                ia, ib, ic, id_ = D / det, -B / det, -C / det, A / det
                ie, if_ = -(ia * E + ic * F), -(ib * E + id_ * F)
                layer = im.transform((W, H), Image.AFFINE, (ia, ic, ie, ib, id_, if_), resample=Image.BILINEAR)
                if ca * alpha < 1:
                    r, g, bb, al = layer.split()
                    al = al.point(lambda v: int(v * ca * alpha))
                    layer = Image.merge('RGBA', (r, g, bb, al))
                canvas.alpha_composite(layer)

    draw(root, frame, (1, 0, 0, 1, 0, 0), 1)
    canvas.save(out)


if __name__ == '__main__':
    render(sys.argv[1], sys.argv[2] if sys.argv[2] != '-' else None, int(sys.argv[3]), sys.argv[4])
