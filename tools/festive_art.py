"""Builds src/components/effects/FestiveEffects.css: the festive decorations
as inline SVG (data URIs, allowed by the CSP). Run: python3 tools/festive_art.py
The night skies of the dark theme are hand-written, in FestiveSky.css."""
import math
from urllib.parse import quote

def svg(body, w, h):
    return 'url("data:image/svg+xml,' + quote(f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>{body}</svg>", safe="=:/ '") + '")'

# --- Christmas lights: a sagging wire with four bulbs per 240 px
def bulb(x, color):
    return (f"<circle cx='{x}' cy='20' r='9' fill='{color}' opacity='.28'/>"
            f"<rect x='{x-2.6}' y='8' width='5.2' height='5' rx='1' fill='#23422c'/>"
            f"<ellipse cx='{x}' cy='19' rx='4.4' ry='6.4' fill='{color}'/>"
            f"<ellipse cx='{x-1.4}' cy='16.5' rx='1.3' ry='2.2' fill='#fff' opacity='.75'/>")
wire = "<path d='M0 5 Q30 15 60 5 T120 5 T180 5 T240 5' fill='none' stroke='#23422c' stroke-width='1.6'/>"
lights_a = svg(wire + bulb(30, '#ff3b3b') + bulb(90, '#ffd23f') + bulb(150, '#3bd36b') + bulb(210, '#45a8ff'), 240, 30)
lights_b = svg(wire + bulb(30, '#ff8080') + bulb(90, '#fff1a8') + bulb(150, '#9df0b8') + bulb(210, '#a6d6ff'), 240, 30)

hat = svg("<path d='M4 30 C10 12 22 4 34 8 C30 14 30 22 32 30 Z' fill='#d6262e'/><rect x='2' y='27' width='34' height='7' rx='3.5' fill='#fff'/><circle cx='35' cy='9' r='4' fill='#fff'/>", 40, 36)

# --- Pine trees in the snow, for the bottom of the page
def tree(x, s, lights=True):
    g = f"<g transform='translate({x} {110 - 100*s}) scale({s})'>"
    g += "<rect x='-6' y='78' width='12' height='16' fill='#6b4423'/>"
    for i, (w, y) in enumerate([(34, 18), (44, 40), (54, 62)]):
        g += f"<path d='M0 {y-22} L{w} {y+20} L-{w} {y+20} Z' fill='{['#2f8a4c','#267a41','#1d6b3a'][i]}'/>"
        g += f"<path d='M-{w} {y+20} Q-{w/2} {y+14} 0 {y+19} T{w} {y+20}' fill='none' stroke='#fff' stroke-width='4' stroke-linecap='round' opacity='.9'/>"
    if lights:
        for (bx, by, c) in [(-14, 30, '#ff3b3b'), (12, 44, '#ffd23f'), (-22, 58, '#45a8ff'), (20, 70, '#ff3b3b'), (-4, 76, '#3bd36b'), (26, 52, '#ff8ad8')]:
            g += f"<circle cx='{bx}' cy='{by}' r='3.4' fill='{c}'/>"
    g += "<path d='M0 -12 l3.5 7 7.6 1 -5.5 5.3 1.3 7.6 -6.9 -3.6 -6.9 3.6 1.3 -7.6 -5.5 -5.3 7.6 -1z' fill='#ffd23f' stroke='#e8a100' stroke-width='1'/>"
    return g + "</g>"
ground_snow = "<path d='M0 96 Q60 84 120 94 T240 92 T360 95 V110 H0Z' fill='#ffffff'/><path d='M0 96 Q60 84 120 94 T240 92 T360 95' fill='none' stroke='#d6ecfa' stroke-width='2'/>"
trees = svg(tree(50, 1.0) + tree(150, 0.62) + tree(250, 0.85) + tree(320, 0.5, False) + ground_snow, 360, 110)

# --- Winter: icicles under the bar, snow drifts at the bottom
def icicle(x, l, w):
    return (f"<path d='M{x-w} 0 L{x+w} 0 L{x} {l} Z' fill='url(#ice)'/>"
            f"<path d='M{x-w*0.35} 1 L{x} {l*0.8}' stroke='#fff' stroke-width='1' opacity='.8'/>")
ice_defs = "<defs><linearGradient id='ice' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff'/><stop offset='1' stop-color='#bfe4fb' stop-opacity='.85'/></linearGradient></defs>"
icicles = svg(ice_defs + "<rect width='96' height='3' fill='#fff'/>" + icicle(8, 14, 4) + icicle(22, 24, 5) + icicle(34, 10, 3) + icicle(49, 19, 4.5) + icicle(63, 28, 5) + icicle(76, 12, 3.5) + icicle(88, 20, 4), 96, 30)
def snowman(x):
    return (f"<g transform='translate({x} 0)'><circle cx='0' cy='84' r='15' fill='#fff' stroke='#cfe3f2'/><circle cx='0' cy='60' r='11' fill='#fff' stroke='#cfe3f2'/>"
            f"<rect x='-9' y='40' width='18' height='4' fill='#2b2b2b'/><rect x='-6' y='28' width='12' height='13' fill='#2b2b2b'/>"
            f"<circle cx='-4' cy='57' r='1.5' fill='#222'/><circle cx='4' cy='57' r='1.5' fill='#222'/><path d='M0 61 l9 2 -9 1.5z' fill='#f28c2e'/>"
            f"<path d='M-10 66 q10 5 20 0' stroke='#d6262e' stroke-width='4' fill='none'/></g>")
drifts = svg(snowman(300) + "<path d='M0 92 Q70 76 140 90 T280 86 T420 92 V110 H0Z' fill='#fff'/><path d='M0 92 Q70 76 140 90 T280 86 T420 92' fill='none' stroke='#cfe3f2' stroke-width='2'/>", 420, 110)

# --- Halloween: cobweb, pumpkin, and pumpkins with gravestones at the bottom
web = svg("<g fill='none' stroke='rgba(255,255,255,0.55)' stroke-width='1'><path d='M0 0 L70 0 M0 0 L62 34 M0 0 L34 62 M0 0 L0 70'/><path d='M0 14 Q8 10 14 0 M0 28 Q16 22 28 0 M0 44 Q24 34 44 0 M0 60 Q32 46 60 0'/></g>", 72, 72)
def pumpkin(x, y, s):
    return (f"<g transform='translate({x} {y}) scale({s})'><ellipse cx='0' cy='0' rx='20' ry='15' fill='#e8741c'/><ellipse cx='0' cy='0' rx='8' ry='15' fill='#f28c2e'/>"
            f"<rect x='-2' y='-20' width='4' height='7' rx='2' fill='#4a7a24'/><path d='M-10 -4 l4 4 h-7z M10 -4 l-4 4 h7z' fill='#2a1206'/>"
            f"<path d='M-10 6 q10 7 20 0 l-3 2 -3 -2 -3 2 -3 -2 -3 2z' fill='#2a1206'/></g>")
pumpkin_one = svg(pumpkin(20, 20, 0.95), 40, 38)
grave = "<g transform='translate(200 58)'><path d='M-18 44 V6 Q-18 -14 0 -14 Q18 -14 18 6 V44Z' fill='#7a7d86'/><path d='M-8 8 h16 M0 0 v18' stroke='#5a5d66' stroke-width='3'/></g>"
halloween_ground = svg(grave + pumpkin(70, 92, 1.1) + pumpkin(300, 96, 0.8) + pumpkin(120, 100, 0.6) + "<path d='M0 102 Q90 94 180 102 T360 100 V110 H0Z' fill='#2a1636'/>", 360, 110)

# --- Autumn: piles of leaves
def leaf(x, y, r, c):
    return f"<path transform='translate({x} {y}) rotate({r})' d='M0 -9 Q8 -3 0 9 Q-8 -3 0 -9Z' fill='{c}'/>"
import random
random.seed(4)
cols = ['#d9531e', '#e8891c', '#c43c1c', '#f2b134', '#9c4a1a', '#b87333']
autumn = "".join(leaf(random.uniform(0, 300), random.uniform(84, 106), random.uniform(0, 360), random.choice(cols)) for _ in range(70))
autumn_ground = svg("<path d='M0 100 Q75 90 150 98 T300 96 V110 H0Z' fill='#8a5a2b' opacity='.5'/>" + autumn, 300, 110)

# --- Spring: a blossom branch in the bar, and tulips at the bottom
def blossom(x, y, s):
    petals = "".join(f"<ellipse cx='0' cy='-5' rx='3.4' ry='5' fill='#ffc4dc' transform='rotate({a})'/>" for a in range(0, 360, 72))
    return f"<g transform='translate({x} {y}) scale({s})'>{petals}<circle r='2' fill='#e0608f'/></g>"
branch = svg("<path d='M0 8 Q40 14 70 30 T130 40' stroke='#6b4423' stroke-width='3' fill='none'/><path d='M60 26 q8 -12 22 -14' stroke='#6b4423' stroke-width='2' fill='none'/>" + blossom(28, 12, 1.1) + blossom(52, 22, 0.9) + blossom(82, 12, 1) + blossom(100, 38, 1.2) + blossom(122, 40, 0.8), 140, 52)
def tulip(x, h, c):
    return (f"<path d='M{x} 110 V{110-h}' stroke='#3f9b3a' stroke-width='3'/><path d='M{x} {110-h*0.45} q-12 -6 -14 -20 q10 6 14 16' fill='#4fb048'/>"
            f"<path d='M{x-8} {110-h} q0 -14 8 -16 q8 2 8 16 q-8 6 -16 0z' fill='{c}'/><path d='M{x} {110-h-16} v10' stroke='#fff' stroke-width='1' opacity='.4'/>")
spring_ground = svg("<path d='M0 102 Q60 96 120 102 T240 100 V110 H0Z' fill='#6fcf6a'/>" + tulip(30, 44, '#f26b6b') + tulip(70, 36, '#f7c046') + tulip(118, 50, '#e0679a') + tulip(170, 40, '#8b72d9') + tulip(210, 30, '#f26b6b'), 240, 110)


# ============================================================ Valentijnsdag
def heart_path(x, y, s, c, extra=''):
    return f"<path transform='translate({x} {y}) scale({s})' d='M0 8 C-14 -1 -9 -13 0 -6 C9 -13 14 -1 0 8Z' fill='{c}'{extra}/>"
def heart_garland(tilt):
    out = "<path d='M0 4 Q30 13 60 4 T120 4 T180 4 T240 4' fill='none' stroke='#b0485e' stroke-width='1.4'/>"
    for i, (x, c) in enumerate([(30, '#e8384f'), (90, '#ff7aa2'), (150, '#c81d3a'), (210, '#ff9ec0')]):
        r = tilt if i % 2 else -tilt
        out += f"<path d='M{x} 8 V14' stroke='#b0485e' stroke-width='1'/><g transform='rotate({r} {x} 14)'>{heart_path(x, 22, 0.8, c)}<ellipse cx='{x-4}' cy='18' rx='1.6' ry='2.4' fill='#fff' opacity='.55'/></g>"
    return svg(out, 240, 34)
hearts_a = heart_garland(8)
hearts_b = heart_garland(-8)
cupid_heart = svg("<path d='M4 30 L36 6' stroke='#8a5a2b' stroke-width='2'/><path d='M36 6 l-7 1 3 3z' fill='#8a5a2b'/><path d='M4 30 l2 -6 M4 30 l6 -2 M7 28 l2 -6 M7 28 l6 -2' stroke='#e8384f' stroke-width='1.6'/>" + heart_path(20, 18, 1.05, '#e8384f') + "<ellipse cx='15' cy='14' rx='2' ry='3' fill='#fff' opacity='.5'/>", 40, 36)
def rose(x, y, s, c):
    return (f"<g transform='translate({x} {y}) scale({s})'><path d='M0 6 V26' stroke='#3f7a34' stroke-width='2'/><path d='M0 16 q-8 -2 -9 -8 q7 1 9 6z' fill='#4f9a3f'/>"
            f"<circle r='7' fill='{c}'/><path d='M-4 -1 q4 -5 8 0 q-4 5 -8 0 M-2 -3 q3 -2 4 1' stroke='rgba(0,0,0,.25)' stroke-width='1.2' fill='none'/></g>")
def balloon(x, h, c):
    return (f"<path d='M{x} 110 Q{x-6} {110 - h/2} {x} {110 - h + 10}' stroke='#9a8a8a' stroke-width='1' fill='none'/>"
            + heart_path(x, 110 - h, 1.35, c) + f"<ellipse cx='{x-6}' cy='{110-h-5}' rx='2.2' ry='3.4' fill='#fff' opacity='.5'/>")
valentine_ground = svg("<path d='M0 100 Q40 88 80 98 T160 96 T240 98 T320 96 V110 H0Z' fill='#4f9a3f'/>"
    + balloon(60, 70, '#e8384f') + balloon(215, 58, '#ff7aa2')
    + rose(20, 88, 0.9, '#d6263e') + rose(110, 90, 0.8, '#ff6f91') + rose(150, 86, 1, '#c81d3a') + rose(270, 89, 0.85, '#e8384f') + rose(300, 91, 0.7, '#ff9ec0')
    + "<path d='M0 104 Q80 98 160 104 T320 103 V110 H0Z' fill='#3f8a33'/>", 320, 110)
# The heart-shaped moon of the dark theme
heart_moon = svg("<defs><radialGradient id='m' cx='.38' cy='.34' r='.75'><stop offset='0' stop-color='#fff4f7'/><stop offset='.55' stop-color='#ffc2d4'/><stop offset='1' stop-color='#f08aa8'/></radialGradient></defs>"
    "<path d='M50 90 C-8 52 8 2 50 26 C92 2 108 52 50 90Z' fill='url(#m)'/><circle cx='34' cy='38' r='5' fill='rgba(160,40,80,.1)'/><circle cx='60' cy='56' r='7' fill='rgba(160,40,80,.08)'/>", 100, 100)

# ============================================================ Pasen
def bunting(colors, trim=None, w=240):
    out = f"<path d='M0 4 Q{w/4} 14 {w/2} 4 T{w} 4' fill='none' stroke='#8a7a60' stroke-width='1.3'/>"
    n = len(colors)
    for i, c in enumerate(colors):
        x = (i + 0.5) * w / n
        t = (x % (w / 2)) / (w / 2)
        y = 4 + 10 * t * (1 - t) * 2
        out += f"<path d='M{x-11} {y-0.5} L{x+11} {y+0.5} L{x} {y+20} Z' fill='{c}'/>"
        if trim:
            out += f"<path d='M{x-8} {y+3} L{x+8} {y+3.4}' stroke='{trim}' stroke-width='2'/>"
    return svg(out, w, 30)
easter_bunting = bunting(['#ffd86b', '#b9e4a3', '#c9b6f2', '#ffb3cf', '#a8dcff', '#ffe9a8'])
bunny_ears = svg("<g transform='rotate(-14 12 34)'><ellipse cx='12' cy='16' rx='6' ry='16' fill='#f4f1ea' stroke='#d8cfc2'/><ellipse cx='12' cy='17' rx='3' ry='11' fill='#ffc4d6'/></g>"
    "<g transform='rotate(12 30 34)'><ellipse cx='30' cy='16' rx='6' ry='16' fill='#f4f1ea' stroke='#d8cfc2'/><ellipse cx='30' cy='17' rx='3' ry='11' fill='#ffc4d6'/></g>", 42, 36)
def egg(x, y, s, c, deco, d2):
    body = f"<ellipse cx='0' cy='0' rx='9' ry='12' fill='{c}'/>"
    if deco == 'zig':
        body += f"<path d='M-9 0 l3 -3 3 3 3 -3 3 3 3 -3 3 3' stroke='{d2}' stroke-width='1.8' fill='none'/>"
    elif deco == 'dots':
        body += ''.join(f"<circle cx='{dx}' cy='{dy}' r='1.6' fill='{d2}'/>" for dx, dy in [(-4, -5), (3, -3), (-2, 3), (5, 5), (0, -9)])
    else:
        body += f"<path d='M-8.5 -3 H8.5 M-8.8 3 H8.8' stroke='{d2}' stroke-width='2'/>"
    body += "<ellipse cx='-3' cy='-5' rx='2' ry='3.5' fill='#fff' opacity='.45'/>"
    return f"<g transform='translate({x} {y}) scale({s}) rotate({(x * 7) % 30 - 15})'>{body}</g>"
def bunny(x):
    return (f"<g transform='translate({x} 0)'><ellipse cx='0' cy='92' rx='15' ry='12' fill='#f4f1ea'/><circle cx='-14' cy='92' r='5' fill='#fff'/>"
            f"<circle cx='12' cy='78' r='9' fill='#f4f1ea'/><ellipse cx='9' cy='60' rx='3.4' ry='12' fill='#f4f1ea' transform='rotate(-10 9 70)'/><ellipse cx='16' cy='61' rx='3.4' ry='12' fill='#f4f1ea' transform='rotate(12 16 70)'/>"
            f"<ellipse cx='9' cy='61' rx='1.6' ry='8' fill='#ffc4d6' transform='rotate(-10 9 70)'/><circle cx='15' cy='77' r='1.4' fill='#2a2320'/><circle cx='20' cy='80' r='1.5' fill='#f5a9bd'/>"
            f"<ellipse cx='6' cy='103' rx='6' ry='3' fill='#e8e2d8'/></g>")
def chick(x):
    return (f"<g transform='translate({x} 0)'><ellipse cx='0' cy='98' rx='9' ry='8' fill='#ffd23f'/><circle cx='5' cy='88' r='6' fill='#ffd23f'/>"
            f"<path d='M10 88 l5 1.5 -5 1.5z' fill='#f28c2e'/><circle cx='6' cy='86' r='1.1' fill='#2a2320'/><path d='M-6 96 q4 -4 8 0' stroke='#e8b100' stroke-width='1.5' fill='none'/></g>")
def daisy(x, y):
    pet = ''.join(f"<ellipse cx='0' cy='-3.5' rx='1.6' ry='3' fill='#fff' transform='rotate({a})'/>" for a in range(0, 360, 45))
    return f"<g transform='translate({x} {y})'>{pet}<circle r='1.6' fill='#ffd23f'/></g>"
easter_ground = svg("<path d='M0 98 Q60 88 120 96 T240 94 T360 97 V110 H0Z' fill='#7cc85a'/>"
    + bunny(260) + chick(120)
    + egg(40, 96, 1, '#ffb3cf', 'zig', '#fff') + egg(64, 100, 0.8, '#a8dcff', 'dots', '#fff') + egg(170, 98, 0.95, '#c9b6f2', 'bands', '#ffe27a')
    + egg(198, 101, 0.75, '#ffe27a', 'zig', '#f28c2e') + egg(320, 99, 0.9, '#b9e4a3', 'dots', '#e0608f')
    + daisy(90, 100) + daisy(150, 104) + daisy(230, 102) + daisy(345, 104) + daisy(12, 104)
    + "<path d='M0 104 Q90 99 180 104 T360 103 V110 H0Z' fill='#6fbf4a'/>", 360, 110)

# ============================================================ Sinterklaas
sint_bunting = bunting(['#c8102e', '#ffffff', '#c8102e', '#ffffff', '#c8102e', '#ffffff'], '#d4a017')
mitre = svg("<path d='M6 34 L6 16 Q6 6 15 1 Q17 6 20 8 Q23 6 25 1 Q34 6 34 16 L34 34 Z' fill='#c8102e'/>"
    "<path d='M6 28 H34 V34 H6Z M18 8 H22 V28 H18Z' fill='#d4a017'/><path d='M13 16 H27 V20 H13Z' fill='#d4a017'/>"
    "<path d='M6 16 Q6 6 15 1 Q17 6 20 8' fill='none' stroke='#f2c94c' stroke-width='1.4'/>", 40, 36)

# Dutch gables: a facade outline (from the bottom left, clockwise) for a house of width w,
# walls up to y=top, with the gable on top.
def facade(kind, x, w, top, base=110):
    L, R, m = x, x + w, x + w / 2
    if kind == 'trap':
        st = w / 7
        h = w * 0.16
        pts = [(L, base), (L, top), (L + st, top), (L + st, top - h), (L + 2 * st, top - h), (L + 2 * st, top - 2 * h), (L + 3 * st, top - 2 * h), (L + 3 * st, top - 3 * h),
               (R - 3 * st, top - 3 * h), (R - 3 * st, top - 2 * h), (R - 2 * st, top - 2 * h), (R - 2 * st, top - h), (R - st, top - h), (R - st, top), (R, top), (R, base)]
        return 'M' + ' L'.join(f'{px:.1f} {py:.1f}' for px, py in pts) + 'Z'
    if kind == 'tuit':
        return f'M{L} {base} L{L} {top} L{m - w * 0.12:.1f} {top - w * 0.6:.1f} L{m + w * 0.12:.1f} {top - w * 0.6:.1f} L{R} {top} L{R} {base}Z'
    if kind == 'klok':
        n = w * 0.22
        return (f'M{L} {base} L{L} {top} Q{L + n:.1f} {top} {m - n:.1f} {top - w * 0.3:.1f} L{m - n:.1f} {top - w * 0.55:.1f} Q{m:.1f} {top - w * 0.75:.1f} {m + n:.1f} {top - w * 0.55:.1f} '
                f'L{m + n:.1f} {top - w * 0.3:.1f} Q{R - n:.1f} {top} {R} {top} L{R} {base}Z')
    # hals: a neck with rounded shoulders
    n = w * 0.26
    return (f'M{L} {base} L{L} {top} Q{L} {top - w * 0.2:.1f} {m - n:.1f} {top - w * 0.22:.1f} L{m - n:.1f} {top - w * 0.52:.1f} L{m - n * 0.5:.1f} {top - w * 0.6:.1f} '
            f'L{m + n * 0.5:.1f} {top - w * 0.6:.1f} L{m + n:.1f} {top - w * 0.52:.1f} L{m + n:.1f} {top - w * 0.22:.1f} Q{R} {top - w * 0.2:.1f} {R} {top} L{R} {base}Z')

def windows(x, w, top, base, fill, frame, lit=None, rnd=None):
    out = ''
    cols = 2 if w < 46 else 3
    ww = w / (cols * 2 + 1)
    y = top + 6
    row = 0
    while y + 12 < base - 16:
        for c in range(cols):
            wx = x + ww * (2 * c + 1)
            f = fill
            if lit and rnd.random() < 0.38:
                f = lit
            out += f"<rect x='{wx:.1f}' y='{y:.1f}' width='{ww:.1f}' height='11' fill='{f}'{frame}/>"
        y += 17
        row += 1
    # A door
    out += f"<rect x='{x + w / 2 - 5:.1f}' y='{base - 15:.1f}' width='10' height='15' rx='5' ry='3' fill='{fill if not lit else '#1a1410'}'{frame}/>"
    return out

rnd = random.Random(12)
houses = ''
# Widths that fill the 480 px tile exactly, so the row repeats without gaps
widths = [42, 50, 46, 38, 46, 42, 50, 38, 44, 40, 44]
widths[-1] += 480 - sum(widths)
kinds = ['trap', 'klok', 'hals', 'tuit']
bricks = ['#9c3b2b', '#7a2e22', '#b5553c', '#5c3a2e', '#d9c7a6', '#8a4a32']
x = 0
for i, w in enumerate(widths):
    top = rnd.choice([52, 56, 60, 64])
    k = kinds[i % 4]
    c = bricks[(i * 5 + 2) % len(bricks)]
    houses += f"<path d='{facade(k, x, w, top)}' fill='{c}'/>"
    houses += f"<path d='{facade(k, x, w, top)}' fill='none' stroke='#fff' stroke-width='1.6' opacity='.55'/>"
    houses += windows(x, w, top, 110, '#2b3a4a', " stroke='#fff' stroke-width='1.4'")
    x += w
shoe = ("<g transform='translate(0 0)'><path d='M8 108 Q8 96 20 96 L28 96 Q30 100 40 101 Q46 102 46 108 Z' fill='#6b3a1e'/><path d='M8 108 H46' stroke='#3a1f0e' stroke-width='3'/>"
        "<path d='M22 96 L34 76' stroke='#f28c2e' stroke-width='5' stroke-linecap='round'/><path d='M34 76 l3 -6 M34 76 l5 -3' stroke='#4f9a3f' stroke-width='2'/></g>")
sint_ground = svg(houses + "<rect y='106' width='480' height='4' fill='#6b6b6b'/>", 480, 110)
shoe_one = svg(shoe, 50, 110)

# The dark theme: a skyline of gabled houses along the bottom of the night sky,
# some windows lit, and Sinterklaas on his horse on a roof.
rnd = random.Random(7)
sky = ''
x = 0
while x < 1200:
    w = rnd.choice([56, 64, 72, 80, 88])
    # The last house fills the tile up exactly
    if 1200 - x - w < 56:
        w = 1200 - x
    top = rnd.choice([120, 132, 146, 160, 172])
    k = kinds[rnd.randrange(4)]
    sky += f"<path d='{facade(k, x, w, top, 300)}' fill='#07081a'/>"
    # A chimney now and then
    if rnd.random() < 0.35:
        sky += f"<rect x='{x + w * 0.72:.1f}' y='{top - 22}' width='8' height='24' fill='#07081a'/>"
    sky += windows(x, w, top, 300, '#12142e', '', '#ffcf6e', rnd)
    x += w
# Sinterklaas on his horse, as a silhouette in front of the moon
sint_rider = svg("<g fill='#0b0d24'>"
        # The horse, galloping: body, neck, head, legs and tail
        "<ellipse cx='30' cy='40' rx='20' ry='9'/><path d='M44 36 Q52 22 58 20 L62 24 Q56 30 50 40Z'/><path d='M56 18 l9 3 -2 5 -8 -2z'/>"
        "<path d='M14 44 l-8 14 h3 l9 -12z M22 46 l-1 14 h3 l2 -14z M38 46 l5 12 h3 l-4 -12z M46 42 l8 12 h3 l-7 -12z'/>"
        "<path d='M11 38 Q2 40 0 52 Q6 46 12 44z'/>"
        # Sinterklaas with his cape, mitre and staff
        "<path d='M20 36 Q22 16 32 14 Q38 18 38 34Z'/><circle cx='31' cy='10' r='5'/><path d='M27 7 L28 -4 Q31 -8 34 -4 L35 7Z'/>"
        "<path d='M41 -8 V36' stroke='#0b0d24' stroke-width='2'/><path d='M41 -8 q6 0 6 5 q0 4 -4 4' stroke='#0b0d24' stroke-width='2' fill='none'/></g>", 66, 64)
skyline = svg(sky, 1200, 300)

# ============================================================ Zomer
sun_shades = svg("<g stroke='#f7a33b' stroke-width='2.6' stroke-linecap='round'>" + ''.join(f"<path d='M20 18 m{math.cos(a/57.3)*13:.1f} {math.sin(a/57.3)*13:.1f} l{math.cos(a/57.3)*5:.1f} {math.sin(a/57.3)*5:.1f}'/>" for a in range(0, 360, 45)) + "</g>"
    "<circle cx='20' cy='18' r='10' fill='#ffd23f'/><path d='M10 15 H30 V17 Q30 22 25 22 Q21 22 21 17 H19 Q19 22 15 22 Q10 22 10 17Z' fill='#1d1d22'/><path d='M13 17 h3' stroke='#fff' stroke-width='1' opacity='.6'/>"
    "<path d='M15 25 q5 3 10 0' stroke='#c46a06' stroke-width='1.5' fill='none'/>", 40, 36)
beach_ball = svg("<circle cx='16' cy='16' r='14' fill='#fff'/><path d='M16 2 A14 14 0 0 1 30 16 L16 16Z' fill='#e8384f'/><path d='M16 30 A14 14 0 0 1 2 16 L16 16Z' fill='#4ba3e0'/>"
    "<path d='M2 16 A14 14 0 0 1 16 2 L16 16Z' fill='#ffd23f'/><circle cx='16' cy='16' r='14' fill='none' stroke='rgba(0,0,0,.2)'/><ellipse cx='10' cy='9' rx='3' ry='2' fill='#fff' opacity='.6'/>", 32, 32)
def parasol(x):
    # Wedges from the top to the rim, red and white in turn
    edge = lambda t: (-26 + 60 * t, 62 - 12 * t)
    out = ''
    for j in range(5):
        (ax, ay), (bx, by) = edge(j / 5), edge((j + 1) / 5)
        mx, my = (ax + bx) / 2, (ay + by) / 2 + 3
        out += f"<path d='M4 40 L{ax:.1f} {ay:.1f} Q{mx:.1f} {my:.1f} {bx:.1f} {by:.1f} Z' fill='{['#e8384f', '#ffffff'][j % 2]}'/>"
    return (f"<g transform='translate({x} 0)'><path d='M0 106 L4 42' stroke='#8a6a4f' stroke-width='2.4'/>{out}"
            "<path d='M-26 62 L34 50' stroke='rgba(0,0,0,.15)' stroke-width='1'/><circle cx='4' cy='40' r='2' fill='#8a6a4f'/></g>")
def castle(x):
    return (f"<g transform='translate({x} 0)' fill='#e0bf6e'><rect x='-14' y='88' width='28' height='16'/><rect x='-18' y='78' width='10' height='26'/><rect x='8' y='78' width='10' height='26'/>"
            "<path d='M-18 78 h3 v-3 h4 v3 h3 M8 78 h3 v-3 h4 v3 h3' stroke='#e0bf6e' stroke-width='2'/><rect x='-4' y='94' width='8' height='10' rx='4' fill='#b8964a'/>"
            "<path d='M13 78 V66' stroke='#8a6a4f' stroke-width='1.4'/><path d='M13 66 l8 3 -8 3z' fill='#e8384f'/></g>")
def shell(x, y, c):
    return f"<g transform='translate({x} {y})'><path d='M-5 2 Q0 -8 5 2Z' fill='{c}'/><path d='M0 2 V-4 M-2.5 2 L-1.5 -3 M2.5 2 L1.5 -3' stroke='rgba(0,0,0,.2)' stroke-width='.8'/></g>"
def starfish(x, y):
    return f"<path transform='translate({x} {y}) scale(.55)' d='M0 -12 l3.5 8 9 1 -6.8 6 2 9 -7.7 -4.6 -7.7 4.6 2 -9 -6.8 -6 9 -1z' fill='#f28c5a'/>"
summer_ground = svg("<rect y='66' width='400' height='24' fill='#3aa7d8'/><path d='M0 68 Q25 62 50 68 T100 68 T150 68 T200 68 T250 68 T300 68 T350 68 T400 68' fill='none' stroke='#fff' stroke-width='2' opacity='.8'/>"
    "<path d='M0 78 Q25 74 50 78 T100 78 T150 78 T200 78 T250 78 T300 78 T350 78 T400 78' fill='none' stroke='#9fdcf5' stroke-width='1.5'/>"
    "<path d='M0 90 Q50 84 100 90 T200 88 T300 90 T400 88 V110 H0Z' fill='#f4dc9c'/><path d='M0 92 Q50 86 100 92 T200 90 T300 92 T400 90' fill='none' stroke='#fff' stroke-width='2' opacity='.6'/>"
    + parasol(300) + castle(120)
    + "<g transform='translate(200 86)'><circle cx='10' cy='10' r='9' fill='#fff'/><path d='M10 1 A9 9 0 0 1 19 10 L10 10Z' fill='#e8384f'/><path d='M10 19 A9 9 0 0 1 1 10 L10 10Z' fill='#4ba3e0'/><path d='M1 10 A9 9 0 0 1 10 1 L10 10Z' fill='#ffd23f'/></g>"
    + shell(40, 102, '#ffb3cf') + shell(260, 104, '#fff1d6') + shell(370, 101, '#ffd6a5') + starfish(70, 100) + starfish(350, 104), 400, 110)

css = f"""/*
 * Festive decorations (generated by tools/festive_art.py; edit the script,
 * not this file). The canvas with falling things is particles.ts.
 */
.festive-canvas {{
  position: fixed;
  inset: 0;
  z-index: 45;
  width: 100%;
  height: 100%;
  pointer-events: none;
}}

:root[data-festive] .topbar,
:root[data-festive] .topbar-logo {{
  position: relative;
}}

/* Christmas: a strand of lights under the header, and a hat on the logo.
   The header gets some room below it for the lights (and the icicles). */
:root[data-festive='kerst'] .site-hdr,
:root[data-festive='winter'] .site-hdr,
:root[data-festive='valentijn'] .site-hdr,
:root[data-festive='pasen'] .site-hdr,
:root[data-festive='sinterklaas'] .site-hdr {{
  margin-bottom: 18px;
}}

:root[data-festive='kerst'] .site-hdr::after {{
  position: absolute;
  top: calc(100% - 6px);
  right: 14px;
  left: 14px;
  z-index: 3;
  height: 26px;
  background: {lights_a} 0 0 / 208px 26px repeat-x;
  content: '';
  pointer-events: none;
  animation: festive-twinkle 2.4s steps(1) infinite;
}}

@keyframes festive-twinkle {{
  50% {{
    background-image: {lights_b};
    filter: drop-shadow(0 0 4px rgba(255, 240, 180, 0.9));
  }}
}}

:root[data-festive='kerst'] .topbar-logo::before {{
  position: absolute;
  top: -12px;
  left: -8px;
  width: 30px;
  height: 27px;
  background: url('/icons/32/santa_hat.png') center / contain no-repeat;
  content: '';
  transform: rotate(-18deg);
}}

/* Christmas and winter: snow on top of the bar */
:root[data-festive='winter'] .topbar::before,
:root[data-festive='kerst'] .topbar::before {{
  position: absolute;
  top: -2px;
  right: 0;
  left: 0;
  z-index: 1;
  height: 12px;
  background:
    radial-gradient(circle at 50% 0, #ffffff 9px, transparent 10px) 0 0 / 34px 12px repeat-x,
    radial-gradient(circle at 50% 0, #ffffff 6px, transparent 7px) 17px 0 / 34px 9px repeat-x;
  border-radius: 10px 10px 0 0;
  content: '';
  opacity: 0.95;
  pointer-events: none;
}}

/* Winter: icicles hanging from the header */
:root[data-festive='winter'] .site-hdr::after {{
  position: absolute;
  top: calc(100% - 2px);
  right: 14px;
  left: 14px;
  z-index: 3;
  height: 30px;
  background: {icicles} 0 0 / 96px 30px repeat-x;
  content: '';
  pointer-events: none;
}}

/* Halloween: a cobweb in the corner and a pumpkin by the search box */
:root[data-festive='halloween'] .topbar::before {{
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  width: 40px;
  height: 40px;
  background: url('/icons/32/spider_web.png') 0 0 / 40px 40px no-repeat;
  opacity: 0.85;
  content: '';
  pointer-events: none;
}}

:root[data-festive='halloween'] .topbar::after {{
  position: absolute;
  top: 50%;
  right: calc(50% - 250px);
  width: 30px;
  height: 30px;
  background: url('/icons/32/emotion_pumpkin.png') center / contain no-repeat;
  content: '';
  pointer-events: none;
  transform: translateY(-50%);
}}

/* Spring: a flower on the logo */
:root[data-festive='lente'] .topbar-logo::before {{
  position: absolute;
  top: -13px;
  left: -10px;
  width: 26px;
  height: 26px;
  background: url('/icons/32/flower.png') center / contain no-repeat;
  content: '';
  transform: rotate(-12deg);
}}

/* Valentijnsdag: a garland of hearts under the header, swaying, and a heart with an arrow on the logo */
:root[data-festive='valentijn'] .site-hdr::after {{
  position: absolute;
  top: calc(100% - 4px);
  right: 14px;
  left: 14px;
  z-index: 3;
  height: 22px;
  background: url('/icons/32/heart.png') 0 4px / 18px 18px space no-repeat;
  background-repeat: space no-repeat;
  content: '';
  pointer-events: none;
  animation: festive-sway 3s ease-in-out infinite;
}}

@keyframes festive-sway {{
  50% {{
    transform: translateY(3px);
  }}
}}

:root[data-festive='valentijn'] .topbar-logo::before {{
  position: absolute;
  top: -12px;
  left: -10px;
  width: 30px;
  height: 27px;
  background: url('/icons/32/heart.png') center / contain no-repeat;
  content: '';
  transform: rotate(-10deg);
}}

/* Pasen: pastel bunting under the header, and bunny ears behind the logo */
:root[data-festive='pasen'] .site-hdr::after,
:root[data-festive='sinterklaas'] .site-hdr::after {{
  position: absolute;
  top: calc(100% - 4px);
  right: 14px;
  left: 14px;
  z-index: 3;
  height: 26px;
  background: {easter_bunting} 0 0 / 208px 26px repeat-x;
  content: '';
  pointer-events: none;
}}

:root[data-festive='pasen'] .topbar-logo {{
  z-index: 0;
}}

/* Behind the letters, peeking out above them */
:root[data-festive='pasen'] .topbar-logo::before {{
  position: absolute;
  top: -16px;
  left: 1px;
  z-index: -1;
  width: 26px;
  height: 26px;
  background: url('/icons/32/rabbit.png') center / contain no-repeat;
  content: '';
}}

/* Sinterklaas: red and white bunting with a gold trim, and his mitre on the logo */
:root[data-festive='sinterklaas'] .site-hdr::after {{
  background-image: {sint_bunting};
}}

:root[data-festive='sinterklaas'] .topbar-logo::before {{
  position: absolute;
  top: -16px;
  left: -8px;
  width: 26px;
  height: 26px;
  background: {mitre} center / contain no-repeat;
  content: '';
  transform: rotate(-14deg);
}}

/* Zomer: the sun with sunglasses on the logo, and a beach ball by the search box */
:root[data-festive='zomer'] .topbar-logo::before {{
  position: absolute;
  top: -14px;
  left: -12px;
  width: 30px;
  height: 30px;
  background: url('/icons/32/weather_sun.png') center / contain no-repeat;
  content: '';
  animation: festive-sun 12s linear infinite;
}}

@keyframes festive-sun {{
  50% {{
    transform: rotate(12deg);
  }}
}}

:root[data-festive='zomer'] .topbar::after {{
  position: absolute;
  top: 50%;
  right: calc(50% - 250px);
  width: 28px;
  height: 28px;
  background: url('/icons/32/icecream.png') center / contain no-repeat;
  content: '';
  pointer-events: none;
  transform: translateY(-50%);
}}

/* By the search box: the season's Farm-Fresh icon */
:root[data-festive='kerst'] .topbar::after,
:root[data-festive='winter'] .topbar::after,
:root[data-festive='herfst'] .topbar::after,
:root[data-festive='lente'] .topbar::after,
:root[data-festive='valentijn'] .topbar::after,
:root[data-festive='pasen'] .topbar::after,
:root[data-festive='sinterklaas'] .topbar::after {{
  position: absolute;
  top: 50%;
  right: calc(50% - 250px);
  width: 28px;
  height: 28px;
  background: center / contain no-repeat;
  content: '';
  pointer-events: none;
  transform: translateY(-50%);
}}

:root[data-festive='kerst'] .topbar::after {{
  background-image: url('/icons/32/christmas_tree.png');
}}

:root[data-festive='winter'] .topbar::after {{
  background-image: url('/icons/32/snowman.png');
}}

:root[data-festive='herfst'] .topbar::after {{
  background-image: url('/icons/32/mushroom.png');
}}

:root[data-festive='lente'] .topbar::after {{
  background-image: url('/icons/32/butterfly.png');
  animation: festive-flutter 2.6s ease-in-out infinite;
}}

@keyframes festive-flutter {{
  50% {{
    transform: translateY(-62%) rotate(8deg);
  }}
}}

:root[data-festive='valentijn'] .topbar::after {{
  background-image: url('/icons/32/emotion_hand_flower.png');
}}

:root[data-festive='pasen'] .topbar::after {{
  background-image: url('/icons/32/faberge_egg.png');
}}

:root[data-festive='sinterklaas'] .topbar::after {{
  background-image: url('/icons/32/gingerbread_man_chocolate.png');
}}

/* On the logo: a snowman's head in winter, an acorn in autumn, a ghost at Halloween */
:root[data-festive='winter'] .topbar-logo::before,
:root[data-festive='herfst'] .topbar-logo::before,
:root[data-festive='halloween'] .topbar-logo::before {{
  position: absolute;
  top: -13px;
  left: -10px;
  width: 26px;
  height: 26px;
  background: center / contain no-repeat;
  content: '';
  transform: rotate(-14deg);
}}

:root[data-festive='winter'] .topbar-logo::before {{
  background-image: url('/icons/32/snowman_head.png');
}}

:root[data-festive='herfst'] .topbar-logo::before {{
  background-image: url('/icons/32/acorn.png');
}}

:root[data-festive='halloween'] .topbar-logo::before {{
  background-image: url('/icons/32/emotion_ghost.png');
  animation: festive-float 3s ease-in-out infinite;
}}

@keyframes festive-float {{
  50% {{
    transform: rotate(-6deg) translateY(-3px);
  }}
}}

/* The bottom of the page: trees, snow, pumpkins, leaves or tulips */
/* Pinned to the very bottom of the page (also on short pages), in room kept free under the footer */
:root[data-festive] body {{
  position: relative;
  box-sizing: border-box;
  /* The body is zoomed with the text size (global.css), so a full window is 100vh ÷ zoom;
     dvh follows a phone's address bar coming and going */
  min-height: calc(100vh / var(--zoom, 1));
  min-height: calc(100dvh / var(--zoom, 1));
  padding-bottom: 116px;
}}

.festive-ground {{
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 110px;
  background-repeat: repeat-x;
  background-position: left bottom;
  pointer-events: none;
}}

/* The ground the Farm-Fresh icons stand on (FestiveEffects.tsx puts them there) */
.festive-ground.kerst,
.festive-ground.winter {{
  background:
    radial-gradient(ellipse at 50% 100%, #ffffff 58%, transparent 60%) 0 100% / 140px 34px repeat-x,
    linear-gradient(#ffffff, #eef6fc) 0 100% / 100% 18px no-repeat;
}}

.festive-ground.halloween {{
  background:
    radial-gradient(ellipse at 50% 100%, #2a1636 58%, transparent 60%) 0 100% / 180px 30px repeat-x,
    linear-gradient(#2a1636, #1c0e26) 0 100% / 100% 16px no-repeat;
}}

.festive-ground.herfst {{
  background:
    radial-gradient(ellipse at 50% 100%, rgba(138, 90, 43, 0.55) 58%, transparent 60%) 0 100% / 160px 28px repeat-x,
    linear-gradient(rgba(138, 90, 43, 0.55), rgba(110, 70, 30, 0.6)) 0 100% / 100% 14px no-repeat;
}}

.festive-ground.lente,
.festive-ground.valentijn,
.festive-ground.pasen {{
  background:
    radial-gradient(ellipse at 50% 100%, #6fcf6a 58%, transparent 60%) 0 100% / 150px 28px repeat-x,
    linear-gradient(#6fcf6a, #55b552) 0 100% / 100% 14px no-repeat;
}}

/* The season's Farm-Fresh icons on the ground, spread out */
.festive-ground-icons {{
  position: absolute;
  right: 0;
  bottom: 6px;
  left: 0;
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  overflow: hidden;
}}

.festive-ground-icons img {{
  flex: none;
  width: 36px;
  height: 36px;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25));
}}

.festive-ground-icons img.big {{
  width: 44px;
  height: 44px;
}}

.festive-ground-icons img.up {{
  margin-bottom: 26px;
}}

/* Canal houses, with a shoe (and a carrot for the horse) now and then */
.festive-ground.sinterklaas {{
  background-image: {shoe_one}, {sint_ground};
  background-size: 70px 154px, 480px 110px;
  background-position: 70% bottom, left bottom;
  background-repeat: no-repeat, repeat-x;
}}

/* At night the houses in front are darker, under the lit skyline */
:root[data-theme='donker'][data-festive-colors='sinterklaas'] .festive-ground.sinterklaas {{
  filter: brightness(0.62) saturate(0.85);
}}

.festive-ground.zomer {{
  background:
    linear-gradient(#f3d68a, #e9c46a) 0 100% / 100% 16px no-repeat,
    linear-gradient(#3aa7d8, #2b8fc0) 0 calc(100% - 16px) / 100% 14px no-repeat;
}}

/* Dark theme, Valentijnsdag: the moon is a heart */
:root[data-theme='donker'][data-festive-colors='valentijn'] .festive-moon {{
  border-radius: 0;
  background: {heart_moon} center / contain no-repeat;
  box-shadow: none;
  filter: drop-shadow(0 0 22px rgba(255, 140, 180, 0.55)) drop-shadow(0 0 60px rgba(255, 110, 160, 0.25));
  animation: festive-heartbeat 2.8s ease-in-out infinite;
}}

@keyframes festive-heartbeat {{
  0%,
  100% {{
    transform: scale(1);
  }}
  12% {{
    transform: scale(1.06);
  }}
  24% {{
    transform: scale(1);
  }}
  36% {{
    transform: scale(1.04);
  }}
}}

/* Dark theme, Sinterklaas: Dutch gabled houses along the bottom of the night sky,
   windows lit here and there, and Sinterklaas riding past the moon */
:root[data-theme='donker'][data-festive-colors='sinterklaas'] .festive-sky::after {{
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: min(42vh, 360px);
  background: {skyline} left bottom / auto 100% repeat-x;
  content: '';
}}

:root[data-theme='donker'][data-festive-colors='sinterklaas'] .festive-moon {{
  background:
    {sint_rider} 46% 70% / 66% auto no-repeat,
    radial-gradient(circle at 34% 30%, rgba(0, 0, 0, 0.07) 0 11%, transparent 12%),
    radial-gradient(circle at 70% 26%, rgba(0, 0, 0, 0.06) 0 7%, transparent 8%),
    radial-gradient(circle at 38% 36%, #fffdf0, #f4ecc8 55%, #d9cf9e 100%);
}}

@media (max-width: 760px) {{
  :root[data-festive='halloween'] .topbar::after,
  :root[data-festive='zomer'] .topbar::after,
  :root[data-festive='lente'] .topbar::before {{
    display: none;
  }}


  :root[data-festive] body {{
    padding-bottom: 86px;
  }}

  .festive-ground {{
    height: 80px;
    background-size: auto 80px !important;
  }}
}}

:root[data-reduce-motion] .site-hdr::after,
:root[data-reduce-motion] .topbar-logo::before,
:root[data-reduce-motion] .festive-moon {{
  animation: none;
}}
"""
open('src/components/effects/FestiveEffects.css', 'w').write(css)
print('ok', len(css))
