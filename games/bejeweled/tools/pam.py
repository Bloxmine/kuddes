#!/usr/bin/env python3
"""Parser for PopCap PopAnim (.pam) files -> baked per-frame JSON for the web renderer.

Every sprite timeline is baked so each frame lists its visible objects directly:
  [kind, res, a, b, c, d, tx, ty, r, g, b, alpha, frameOffset, additive]
kind 0 = image, 1 = sub-sprite (res is sprite index, frameOffset = sprite-local frame start).
"""
import json, math, struct, sys


class R:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def u8(self): v = self.d[self.p]; self.p += 1; return v
    def u16(self): v = struct.unpack_from('<H', self.d, self.p)[0]; self.p += 2; return v
    def i16(self): v = struct.unpack_from('<h', self.d, self.p)[0]; self.p += 2; return v
    def u32(self): v = struct.unpack_from('<I', self.d, self.p)[0]; self.p += 4; return v
    def i32(self): v = struct.unpack_from('<i', self.d, self.p)[0]; self.p += 4; return v
    def s(self):
        n = self.u16(); v = self.d[self.p:self.p + n].decode('latin-1'); self.p += n; return v


def parse(data):
    r = R(data)
    assert r.u32() == 0xBAF01954, 'not a pam'
    ver = r.i32()
    fps = r.u8()
    pos = (r.i16() / 20, r.i16() / 20)
    size = (r.u16() / 20, r.u16() / 20)
    images = []
    for _ in range(r.u16()):
        name = r.s()
        w = h = 0
        if ver >= 4:
            w, h = r.i16(), r.i16()
        if ver == 1:
            rot = r.i16() / 1000
            t = [math.cos(rot), -math.sin(rot), math.sin(rot), math.cos(rot), r.i16() / 20, r.i16() / 20]
        else:
            t = [r.i32() / 1310720 for _ in range(4)] + [r.i16() / 20, r.i16() / 20]
        images.append({'name': name, 'w': w, 'h': h, 't': t})

    def sprite(named=True):
        sp = {'name': None, 'fps': fps}
        if named and ver >= 4:
            sp['name'] = r.s()
            if ver >= 6:
                r.s()
            sp['fps'] = r.i32() / 65536
        n = r.u16()
        if ver >= 5:
            sp['work'] = (r.u16(), r.u16())
        frames = []
        for _ in range(n):
            frames.append(frame())
        sp['frames'] = frames
        return sp

    def count():
        n = r.u8()
        return r.u16() if n == 255 else n

    def frame():
        fl = r.u8()
        f = {'rm': [], 'add': [], 'mv': [], 'label': None, 'stop': False, 'cmd': []}
        if fl & 1:
            for _ in range(count()):
                i = r.u16()
                if i >= 2047:
                    i = r.u32()
                f['rm'].append(i)
        if fl & 2:
            for _ in range(count()):
                v = r.u16()
                i = v & 2047
                if i == 2047:
                    i = r.u32()
                a = {'i': i, 'sprite': bool(v & 32768), 'additive': bool(v & 16384)}
                res = r.u8()
                if ver >= 6 and res == 255:
                    res = r.u16()
                a['res'] = res
                if v & 8192:
                    a['preload'] = r.u16()
                if v & 4096:
                    a['name'] = r.s()
                if v & 2048:
                    a['ts'] = r.i32() / 65536
                f['add'].append(a)
        if fl & 4:
            for _ in range(count()):
                v = r.u16()
                i = v & 1023
                if i == 1023:
                    i = r.u32()
                m = {'i': i}
                # flags: 0x8000 src rect, 0x4000 rotate, 0x2000 colour, 0x1000 matrix, 0x0800 long coords, 0x0400 anim frame
                if v & 4096:
                    m['m'] = [r.i32() / 65536 for _ in range(4)]  # a, c, b, d
                elif v & 16384:
                    m['rot'] = r.i16() / 1000
                if v & 2048:
                    m['t'] = (r.i32() / 20, r.i32() / 20)
                else:
                    m['t'] = (r.i16() / 20, r.i16() / 20)
                if v & 32768:
                    m['src'] = [r.i16() / 20 for _ in range(4)]
                if v & 8192:
                    m['c'] = [r.u8() / 255 for _ in range(4)]
                if v & 1024:
                    m['af'] = r.u16()
                f['mv'].append(m)
        if fl & 8:
            f['label'] = r.s()
        if fl & 16:
            f['stop'] = True
        if fl & 32:
            for _ in range(r.u8()):
                f['cmd'].append((r.s(), r.s()))
        return f

    sprites = [sprite() for _ in range(r.u16())]
    main = sprite(named=True) if r.u8() else None
    return {'ver': ver, 'fps': fps, 'pos': pos, 'size': size, 'images': images, 'sprites': sprites,
            'main': main, 'consumed': r.p, 'length': len(data)}


def bake(sp):
    """Turn add/remove/move deltas into absolute per-frame object lists."""
    live = {}
    out = []
    labels = {}
    for fi, f in enumerate(sp['frames']):
        for i in f['rm']:
            live.pop(i, None)
        for a in f['add']:
            live[a['i']] = {'kind': 1 if a['sprite'] else 0, 'res': a['res'], 'm': [1, 0, 0, 1], 't': (0, 0),
                            'c': [1, 1, 1, 1], 'start': fi, 'add': a['additive'], 'ts': a.get('ts', 1)}
        for m in f['mv']:
            o = live.get(m['i'])
            if not o:
                continue
            if 'm' in m:
                a, c, b, d = m['m']
                o['m'] = [a, b, c, d]
            elif 'rot' in m:
                ang = m['rot']  # rotation about the object origin, canvas convention
                o['m'] = [math.cos(ang), math.sin(ang), -math.sin(ang), math.cos(ang)]
            o['t'] = m['t']
            if 'c' in m:
                o['c'] = m['c']
            if 'af' in m:
                o['start'] = fi - m['af']
        if f['label']:
            labels[f['label']] = fi
        objs = []
        for i in sorted(live):
            o = live[i]
            a, b, c, d = o['m']
            objs.append([o['kind'], o['res'], round(a, 4), round(b, 4), round(c, 4), round(d, 4),
                         round(o['t'][0], 2), round(o['t'][1], 2)] + [round(v, 3) for v in o['c']] +
                        [o['start'], 1 if o['add'] else 0])
        out.append(objs)
    stops = [i for i, f in enumerate(sp['frames']) if f['stop']]
    return {'name': sp['name'], 'fps': sp['fps'], 'frames': out, 'labels': labels, 'stops': stops}


def to_json(p):
    return {
        'fps': p['fps'], 'size': p['size'], 'pos': p['pos'],
        'images': [{'name': im['name'], 'w': im['w'], 'h': im['h'], 't': [round(v, 5) for v in im['t']]} for im in p['images']],
        'sprites': [bake(s) for s in p['sprites']],
        'main': bake(p['main']) if p['main'] else None,
    }


if __name__ == '__main__':
    for path in sys.argv[1:]:
        p = parse(open(path, 'rb').read())
        print(path.split('/')[-1], 'v%d' % p['ver'], 'fps', p['fps'], 'imgs', len(p['images']), 'sprites', len(p['sprites']),
              'main frames', len(p['main']['frames']) if p['main'] else 0, 'ok' if p['consumed'] == p['length'] else 'MISMATCH %d/%d' % (p['consumed'], p['length']))
