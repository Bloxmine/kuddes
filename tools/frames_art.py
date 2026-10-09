"""Builds src/features/profile/AvatarFrames.css: borders around profile photos,
drawn as SVG border images. Run: python3 tools/frames_art.py"""
from urllib.parse import quote

def svg(body, w, h):
    return 'url("data:image/svg+xml,' + quote(f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>{body}</svg>", safe="=:/ '") + '")'

# A 90×90 tile: a band of colour with a shape in each of the 8 border cells;
# border-image-slice 30 turns it into corners and repeating edges.
CELLS = [(15, 15), (45, 15), (75, 15), (15, 45), (75, 45), (15, 75), (45, 75), (75, 75)]
def band(bg, shape, extra=''):
    ring = f"<path d='M0 0H90V90H0Z M30 30V60H60V30Z' fill-rule='evenodd' fill='{bg}'/>"
    return svg(ring + extra + ''.join(shape(x, y, i) for i, (x, y) in enumerate(CELLS)), 90, 90)

heart = lambda c: lambda x, y, i: f"<path transform='translate({x} {y}) scale(.55)' d='M0 12 C-18 0 -12 -16 0 -6 C12 -16 18 0 0 12Z' fill='{c}'/>"
star = lambda c: lambda x, y, i: f"<path transform='translate({x} {y}) scale(.6)' d='M0 -14 l4 9 10 1 -7.5 7 2 10 -8.5 -5 -8.5 5 2 -10 -7.5 -7 10 -1z' fill='{c}'/>"
def flower(c, mid):
    def f(x, y, i):
        pet = ''.join(f"<ellipse cx='0' cy='-6' rx='4.2' ry='6.5' fill='{c}' transform='rotate({a})'/>" for a in range(0, 360, 72))
        return f"<g transform='translate({x} {y}) scale(.95)'>{pet}<circle r='3' fill='{mid}'/></g>"
    return f
def skull(x, y, i):
    return (f"<g transform='translate({x} {y})'><path d='M-10 2 C-10 -12 10 -12 10 2 C10 6 7 7 6 11 H-6 C-7 7 -10 6 -10 2Z' fill='#fff'/>"
            f"<circle cx='-4' cy='0' r='3' fill='#222'/><circle cx='4' cy='0' r='3' fill='#222'/><path d='M-1 5 h2 l-1 2z' fill='#222'/></g>")
sparkle = lambda x, y, i: (f"<path transform='translate({x} {y}) scale({[.8, .5, .7, .6, .9, .5, .75, .6][i]})' d='M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z' fill='#fff'/>"
                           f"<circle cx='{x + 9}' cy='{y - 8}' r='1.6' fill='#ffe38a'/>")

# Seasonal
def needles(x, y, i):
    greens = ['#1d6b3a', '#2f8a4c', '#267a41']
    out = ''.join(f"<path transform='translate({x} {y}) rotate({a + i * 17})' d='M0 0 L3 -13 L-3 -13Z' fill='{greens[(a // 45 + i) % 3]}'/>" for a in range(0, 360, 45))
    berries = f"<circle cx='{x + 5}' cy='{y + 4}' r='3' fill='#d6262e'/><circle cx='{x + 1}' cy='{y + 7}' r='2.4' fill='#e8383f'/>" if i % 2 == 0 else f"<circle cx='{x - 4}' cy='{y - 3}' r='2.4' fill='#ffd23f'/>"
    return out + berries
def pumpkin(x, y, i):
    if i % 2:
        return f"<circle cx='{x}' cy='{y}' r='3' fill='#f7a14a'/>"
    return (f"<g transform='translate({x} {y}) scale(.6)'><ellipse rx='16' ry='12' fill='#e8741c'/><ellipse rx='6' ry='12' fill='#f28c2e'/>"
            f"<rect x='-2' y='-17' width='4' height='6' rx='2' fill='#4a7a24'/><path d='M-8 -3 l3 3 h-6z M8 -3 l-3 3 h6z M-8 5 q8 6 16 0' fill='#2a1206' stroke='#2a1206' stroke-width='1.5'/></g>")
def flake(x, y, i):
    arms = ''.join(f"<path d='M0 0 V-11 M0 -7 l-3 -3 M0 -7 l3 -3' stroke='#fff' stroke-width='1.8' stroke-linecap='round' transform='rotate({a})'/>" for a in range(0, 360, 60))
    return f"<g transform='translate({x} {y}) scale({[.9, .7, .85, .75, .95, .7, .8, .9][i]})'>{arms}</g>"
def leaf(x, y, i):
    c = ['#d9531e', '#e8891c', '#c43c1c', '#f2b134', '#9c4a1a', '#b87333', '#e8891c', '#d9531e'][i]
    return f"<path transform='translate({x} {y}) rotate({i * 47}) scale(1.1)' d='M0 -11 Q10 -4 0 11 Q-10 -4 0 -11Z M0 -9 V10' fill='{c}' stroke='#7a3b12' stroke-width='.8'/>"

frames = {
    'hartjes': band('#ffd6e6', heart('#e8466a')),
    'sterren': band('#1b2a5c', star('#ffd23f')),
    'bloemen': band('#dff3d8', flower('#f7a1c4', '#f5d04a')),
    'doodskopjes': band('#1a1a1a', skull),
    'glitter': band('#e582ab', sparkle, "<rect width='90' height='90' fill='url(#g)' opacity='.25'/><defs><linearGradient id='g'><stop stop-color='#fff'/><stop offset='1' stop-color='#8b72d9'/></linearGradient></defs>"),
}
def pastel_egg(x, y, i):
    c = ['#ffb3cf', '#a8dcff', '#ffe27a', '#b9e4a3', '#c9b6f2', '#ffd6a5', '#a8dcff', '#ffb3cf'][i]
    return (f"<g transform='translate({x} {y}) rotate({i * 23 - 30})'><ellipse rx='8' ry='10.5' fill='{c}'/>"
            f"<path d='M-8 0 l2.7 -2.7 2.7 2.7 2.7 -2.7 2.7 2.7 2.7 -2.7 2.7 2.7' stroke='#fff' stroke-width='1.6' fill='none'/></g>")
def pepernoot(x, y, i):
    if i % 2:
        return f"<path transform='translate({x} {y}) scale(.45)' d='M0 -14 l4 9 10 1 -7.5 7 2 10 -8.5 -5 -8.5 5 2 -10 -7.5 -7 10 -1z' fill='#f2c94c'/>"
    return (f"<g transform='translate({x} {y})'><circle r='7.5' fill='#a8642c'/><circle cx='-2' cy='-2' r='5' fill='#c07c43'/>"
            f"<circle cx='2' cy='1' r='1' fill='#6b3a1e'/><circle cx='-3' cy='3' r='1' fill='#6b3a1e'/></g>")
def sunny(x, y, i):
    if i % 2:
        return f"<g transform='translate({x} {y})'><path d='M-7 3 Q0 -9 7 3Z' fill='#fff1d6'/><path d='M0 3 V-4 M-3 3 L-2 -3 M3 3 L2 -3' stroke='#d9b98c' stroke-width='.9'/></g>"
    rays = ''.join(f"<path d='M0 -8 V-12' stroke='#f7a33b' stroke-width='2' stroke-linecap='round' transform='rotate({a})'/>" for a in range(0, 360, 45))
    return f"<g transform='translate({x} {y})'>{rays}<circle r='6.5' fill='#ffd23f'/></g>"

seasonal = {
    'valentijn': band('#ffe0e8', heart('#e0405e')),
    'pasen': band('#eef8e2', pastel_egg),
    'sinterklaas': band('#c8102e', pepernoot),
    'zomer': band('#8fd6ec', sunny),
    'kerst': band('#185c30', needles),
    'halloween': band('#2a1636', pumpkin),
    'winter': band('#9fd3f2', flake),
    'herfst': band('#f3e0c2', leaf),
    'lente': band('#fde2ec', flower('#ffc4dc', '#e0608f')),
}
bow = svg("<path d='M20 14 C6 0 0 10 4 18 C8 26 18 20 20 16Z M20 14 C34 0 40 10 36 18 C32 26 22 20 20 16Z' fill='#d6262e'/><path d='M17 15 L11 32 L16 30 L19 34Z M23 15 L29 32 L24 30 L21 34Z' fill='#b31c23'/><circle cx='20' cy='15' r='4' fill='#e8383f'/>", 40, 36)
spider = svg("<path d='M20 0 V16' stroke='#ddd' stroke-width='1'/><g stroke='#1a1a1a' stroke-width='2' fill='none'><path d='M14 20 q-8 -6 -12 -2 M14 24 q-9 0 -12 4 M26 20 q8 -6 12 -2 M26 24 q9 0 12 4'/></g><ellipse cx='20' cy='22' rx='7' ry='8' fill='#1a1a1a'/><circle cx='17' cy='20' r='1.5' fill='#f26b6b'/><circle cx='23' cy='20' r='1.5' fill='#f26b6b'/>", 40, 34)
mitre_top = svg("<path d='M6 34 L6 16 Q6 6 15 1 Q17 6 20 8 Q23 6 25 1 Q34 6 34 16 L34 34 Z' fill='#c8102e'/><path d='M6 28 H34 V34 H6Z M18 8 H22 V28 H18Z M13 16 H27 V20 H13Z' fill='#d4a017'/>", 40, 36)
love = svg("<path d='M20 34 C-6 18 2 -2 20 10 C38 -2 46 18 20 34Z' fill='#e0405e'/><ellipse cx='12' cy='12' rx='3' ry='4.5' fill='#fff' opacity='.5'/>", 40, 36)
snowcap = svg("<path d='M0 14 Q10 0 25 6 Q40 -2 55 6 Q70 0 85 6 Q100 -2 115 6 Q130 0 140 14 Z' fill='#fff'/>", 140, 16)

css = ["""/*
 * Borders around profile photos (generated by tools/frames_art.py; edit the
 * script). .avatar-frame wraps the photo; html[data-festive-frames] swaps in
 * the seasonal one for viewers who have it on (FestiveEffects.tsx).
 */
.avatar-frame {
  position: relative;
  display: inline-block;
  line-height: 0;
}

.avatar-frame.framed {
  border-style: solid;
}

.avatar-frame.frame-goud {
  border-width: 4px;
  border-image: linear-gradient(135deg, #fff3b0, #d4a017 25%, #fbe38a 50%, #b8860b 75%, #fff1a0) 1;
  box-shadow: 0 1px 3px rgba(120, 80, 0, 0.3);
}

.avatar-frame.frame-zilver {
  border-width: 4px;
  border-image: linear-gradient(135deg, #ffffff, #a9b4bd 25%, #eef2f5 50%, #7f8b94 75%, #f3f6f8) 1;
  box-shadow: 0 1px 3px rgba(40, 50, 60, 0.3);
}

.avatar-frame.frame-hout {
  border-width: 6px;
  border-image: repeating-linear-gradient(35deg, #8a5427 0 4px, #9c6331 4px 7px, #7a4a22 7px 9px) 1;
  box-shadow: 0 1px 4px rgba(60, 30, 5, 0.35);
}

.avatar-frame.frame-polaroid {
  border-width: 6px 6px 20px;
  border-color: #fdfdfb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  transform: rotate(-1.5deg);
}

.avatar-frame.frame-neon {
  border-width: 2px;
  border-color: #fff;
  border-radius: 8px;
  box-shadow:
    0 0 3px 1px #3ff4ff,
    0 0 8px 2px #ff4fd8;
  animation: frame-neon 3s linear infinite;
}

@keyframes frame-neon {
  to {
    filter: hue-rotate(360deg);
  }
}

.avatar-frame.frame-regenboog {
  border-width: 4px;
  border-image: conic-gradient(#f26b6b, #f7a33b, #f5e04f, #5fc39a, #4ba3e0, #8b72d9, #f26b6b) 1;
}
"""]
for name, img in frames.items():
    css.append(f""".avatar-frame.frame-{name} {{
  border-width: 8px;
  border-image: {img} 30 round;
}}
""")
reset = """  padding: 0;
  border-style: solid;
  border-radius: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transform: none;
  animation: none;
  filter: none;"""
for name, img in seasonal.items():
    css.append(f""":root[data-festive-frames='{name}'] .avatar-frame:not(.no-season) {{
{reset}
  border-width: 10px;
  border-image: {img} 30 round;
}}
""")
css.append(f""":root[data-festive-frames='kerst'] .avatar-frame:not(.no-season)::after {{
  position: absolute;
  bottom: -16px;
  left: 50%;
  width: 34px;
  height: 30px;
  background: {bow} center / contain no-repeat;
  content: '';
  transform: translateX(-50%);
}}

:root[data-festive-frames='halloween'] .avatar-frame:not(.no-season)::after {{
  position: absolute;
  top: -10px;
  right: -4px;
  width: 24px;
  height: 22px;
  background: {spider} center / contain no-repeat;
  content: '';
}}

:root[data-festive-frames='winter'] .avatar-frame:not(.no-season)::after {{
  position: absolute;
  top: -14px;
  right: -10px;
  left: -10px;
  height: 12px;
  background: {snowcap} center bottom / 100% 100% no-repeat;
  content: '';
}}

:root[data-festive-frames='sinterklaas'] .avatar-frame:not(.no-season)::after {{
  position: absolute;
  top: -22px;
  left: 50%;
  width: 30px;
  height: 27px;
  background: {mitre_top} center / contain no-repeat;
  content: '';
  transform: translateX(-50%);
}}

:root[data-festive-frames='valentijn'] .avatar-frame:not(.no-season)::after {{
  position: absolute;
  right: -10px;
  bottom: -10px;
  width: 28px;
  height: 25px;
  background: {love} center / contain no-repeat;
  content: '';
}}

:root[data-reduce-motion] .avatar-frame:not(.no-season) {{
  animation: none;
}}
""")
open('src/features/profile/AvatarFrames.css', 'w').write('\n'.join(css))
print('ok')
