#!/usr/bin/env python3
"""Build browser-ready assets for the HTML5 port from your own Bejeweled 3 install.

Pipeline:
  1. quickBMS extracts main.pak (tools/popcap_pak.bms) -> extracted/
  2. images: colour (.jp2/.jpg/.gif) + alpha mask ('_' suffix .gif) -> RGBA .png
  3. backgrounds: flattened 1920x1200 stills -> .jpg
  4. fonts: PopCap font descriptors (.txt) -> .json + layer .png
  5. sounds: copied (already Ogg Vorbis)
  6. music: subsongs of the .mo3 module rendered with openmpt123 -> .ogg

Output goes to web/assets/ together with a manifest.json that the game loads.
The extracted assets are copyrighted by PopCap/EA: keep them local, don't redistribute.
"""
import json, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME_DIR = os.environ.get('BJ3_DIR', os.path.expanduser(
    '~/.local/share/Steam/steamapps/common/Bejeweled 3'))
EXTRACTED = os.path.join(ROOT, 'extracted')
OUT = os.path.join(ROOT, 'web', 'assets')
RES = '1200'

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convimg import convert, load  # noqa: E402

# ---------------------------------------------------------------- images
# id (without IMAGE_ prefix) -> short name used by the game
IMAGES = {
    'GEMS_RED': 'gem0', 'GEMS_WHITE': 'gem1', 'GEMS_GREEN': 'gem2', 'GEMS_YELLOW': 'gem3',
    'GEMS_PURPLE': 'gem4', 'GEMS_ORANGE': 'gem5', 'GEMS_BLUE': 'gem6',
    'GEMSSHADOW_RED': 'gemshadow0', 'GEMSSHADOW_WHITE': 'gemshadow1', 'GEMSSHADOW_GREEN': 'gemshadow2',
    'GEMSSHADOW_YELLOW': 'gemshadow3', 'GEMSSHADOW_PURPLE': 'gemshadow4', 'GEMSSHADOW_ORANGE': 'gemshadow5',
    'GEMSSHADOW_BLUE': 'gemshadow6',
    'GEMOUTLINES': 'gemoutlines',
    'BOMBGLOWS_GLOW': 'bombglow', 'BOMBGLOWS_DANGERGLOW': 'dangerglow',
    'HYPERCUBE_FRAME': 'hypercube', 'HYPERCUBE_COLORGLOW': 'hypercubeglow',
    'SELECTOR': 'selector', 'HINTARROW': 'hintarrow',
    'SPARKLE': 'sparkle', 'SPARKLET': 'sparklet', 'SPARKLET_BIG': 'sparkletbig', 'SPARKLE_FAT': 'sparklefat',
    'SPARKLET_FAT': 'sparkletfat',
    'GEMSHARD': 'gemshard', 'SM_SHARDS': 'smshards', 'SM_SHARDS_OUTLINE': 'smshardsoutline',
    'FIREPARTICLE': 'fireparticle', 'FIRE_RING': 'firering', 'SMOKE': 'smoke', 'FX_STEAM': 'steam',
    'LIGHTNING': 'lightning', 'LIGHTNING_TEX': 'lightningtex', 'LIGHTNING_CENTER': 'lightningcenter',
    'HYPERFLARELINE': 'hyperflareline', 'HYPERFLARERING': 'hyperflarering',
    'VERTICAL_STREAK': 'verticalstreak', 'GRITTYBLURRY': 'grittyblurry',
    'FLAMEGEMEXPLODE_FLAMEEXPLODETEST_LAYER_1': 'flameexplode',
    'FLAMEGEMCREATION_FLAMEGEM_BLUR': 'flameblur',
    'FLAMEGEMCREATION_FLAMEGEM_FLASH_1': 'flameflash1', 'FLAMEGEMCREATION_FLAMEGEM_FLASH_2': 'flameflash2',
    'FLAMEGEMCREATION_FLAMEGEM_LARGE_RING': 'flamelargering',
    'FLAMEGEMCREATION_FLAMEGEM_RING_OF_FLAME': 'flameringofflame',
    'COMPLEMENT_GOOD': 'cmp_good', 'COMPLEMENT_EXCELLENT': 'cmp_excellent', 'COMPLEMENT_AWESOME': 'cmp_awesome',
    'COMPLEMENT_SPECTACULAR': 'cmp_spectacular', 'COMPLEMENT_EXTRAORDINARY': 'cmp_extraordinary',
    'COMPLEMENT_UNBELIEVABLE': 'cmp_unbelievable',
    'INGAMEUI_TOP_FRAME': 'ui_topframe', 'INGAMEUI_TOP_FRAME_GLOW': 'ui_topframeglow',
    'INGAMEUI_BOTTOM_FRAME': 'ui_bottomframe', 'INGAMEUI_BOTTOM_FRAME_GLOW': 'ui_bottomframeglow',
    'INGAMEUI_BOTTOM_FRAME_BACK': 'ui_bottomframeback', 'INGAMEUI_TICK': 'ui_tick', 'INGAMEUI_TICK_GLOW': 'ui_tickglow',
    'INGAMEUI_TOP_WIDGET': 'ui_topwidget', 'INGAMEUI_BOTTOM_WIDGET_CLASSIC': 'ui_bottomwidget',
    'INGAMEUI_HINT_BUTTON_CLASSIC': 'ui_hintbutton', 'INGAMEUI_MENU_BUTTON_CLASSIC': 'ui_menubutton',
    'DIALOG_BACKGROUND': 'dlg_background', 'DIALOG_HEADERLESS_BKG': 'dlg_headerless',
    'DIALOG_SMALL_BUTTON': 'dlg_smallbutton', 'DIALOG_BUTTON_DISABLED': 'dlg_buttondisabled',
    'DIALOG_SLIDERBAR': 'dlg_sliderbar', 'DIALOG_SLIDERHANDLE': 'dlg_sliderhandle',
    'DIALOG_CHECKBOX_BLANK': 'dlg_checkblank', 'DIALOG_CHECKBOX_CHECKED': 'dlg_checkchecked',
    'GAMEOVER_DIALOG': 'go_dialog', 'GAMEOVER_STAMP': 'go_stamp',
    'GAMEOVER_LIGHT_BOX': 'go_lightbox', 'GAMEOVER_DARKER_BOX': 'go_darkerbox',
    'GAMEOVER_SECTION_LABEL': 'go_sectionlabel', 'GAMEOVER_HORIZONTAL_BAR': 'go_hbar',
    'GAMEOVER_ICON_FLAME': 'go_iconflame', 'GAMEOVER_ICON_STAR': 'go_iconstar',
    'GAMEOVER_ICON_HYPERCUBE': 'go_iconhypercube',
    'PARTICLES_BLASTGEM_0_BASIC_BLUR': 'p_basicblur',
    'PARTICLES_BADGE_UPGRADE_2_CERCLEM': 'p_ring',
    'PARTICLES_BOOST_GEM_APPEAR_1_RING_1': 'p_ring1',
    'PARTICLES_STARGEM_1_STAR_GLOW': 'p_starglow', 'PARTICLES_STARGEM_2_CORONAGLOW': 'p_coronaglow',
    'PARTICLES_GEM_LANDING_FX_1_BLURRED_SHARP_STAR': 'p_sharpstar',
    'PARTICLES_STARGEM_0_SMALL_BLUR_STAR': 'p_smallstar',
    'PARTICLES_CRYSTALRAYS_0_RAY': 'p_ray', 'PARTICLES_STARBURST_0_STAR': 'p_star',
    'PARTICLES_QUESTOBJ_ORB_0_SPARK_ALT2': 'p_spark',
    'PARTICLES_COINSPARKLE_0_FLARE': 'p_flare',
    'PARTICLES_LIGHTNING_POWERED_LEFTRIGHT_0_LIGHTNINGPARTICLE': 'p_lightning',
    'PARTICLES_SPEEDBOARD_FLAME_0_FLAME1': 'p_flame',
    'PARTICLES_SPEEDTEXT_FLAME_0_TRUEFLAME5X': 'p_trueflame',
    'PARTICLES_MAINMENU3_0_BLURRED_SPLOTCH': 'p_splotch',
    'PARTICLES_DISCOBALL_0_DISCO_GLOW': 'p_discoglow',
    'COMPLEMENT_BLAZINGSPEED': 'cmp_blazingspeed',
    # lightning mode
    'LIGHTNING_GEMNUMS_RED': 'timenum0', 'LIGHTNING_GEMNUMS_WHITE': 'timenum1', 'LIGHTNING_GEMNUMS_GREEN': 'timenum2',
    'LIGHTNING_GEMNUMS_YELLOW': 'timenum3', 'LIGHTNING_GEMNUMS_PURPLE': 'timenum4', 'LIGHTNING_GEMNUMS_ORANGE': 'timenum5',
    'LIGHTNING_GEMNUMS_BLUE': 'timenum6',
    'INGAMEUI_BOTTOM_WIDGET_LIGHTNING': 'ui_bottomwidget_lightning', 'INGAMEUI_HINT_BUTTON_LIGHTNING': 'ui_hintbutton_lightning',
    'INGAMEUI_MENU_BUTTON_LIGHTNING': 'ui_menubutton_lightning', 'INGAMEUI_RESET_BUTTON_LIGHTNING': 'ui_resetbutton_lightning',
    'INGAMEUI_TIMER_LIGHTNING': 'ui_timer_lightning', 'INGAMEUI_TIMER_RED_LIGHTNING': 'ui_timer_red_lightning',
    'INGAMEUI_TIMER_GOLD_LIGHTNING': 'ui_timer_gold_lightning', 'INGAMEUI_TOP_BACK_LIGHTNING': 'ui_topback_lightning',
    # zen mode
    'INGAMEUI_BOTTOM_WIDGET_ZEN': 'ui_bottomwidget_zen', 'INGAMEUI_OPTIONS_BUTTON_ZEN': 'ui_optionsbutton_zen',
    'INGAMEUI_MENU_BUTTON_ZEN': 'ui_menubutton_zen',
    # quest style widgets (butterflies / diamond mine)
    'INGAMEUI_TOP_WIDGET_QUEST': 'ui_topwidget_quest', 'INGAMEUI_BOTTOM_WIDGET_QUEST': 'ui_bottomwidget_quest',
    'INGAMEUI_HINT_BUTTON_QUEST': 'ui_hintbutton_quest', 'INGAMEUI_MENU_BUTTON_QUEST': 'ui_menubutton_quest',
    'INGAMEUI_RESET_BUTTON_QUEST': 'ui_resetbutton_quest',
    # butterflies
    'BUTTERFLY_BODY': 'bfly_body', 'BUTTERFLY_WINGS': 'bfly_wings', 'BUTTERFLY_SHADOW': 'bfly_shadow', 'BUTTERFLY_WEB': 'bfly_web',
    # diamond mine
    'QUEST_DIG_BOARD_CENTER_FULL': 'dig_dirt', 'QUEST_DIG_BOARD_CENTER_TOP': 'dig_dirttop',
    'QUEST_DIG_BOARD_GRASS': 'dig_grass', 'QUEST_DIG_BOARD_BG': 'dig_bg',
    'QUEST_DIG_BOARD_GOLDGROUP1': 'dig_gold1', 'QUEST_DIG_BOARD_GOLDGROUP2': 'dig_gold2', 'QUEST_DIG_BOARD_GOLDGROUP3': 'dig_gold3',
    'QUEST_DIG_BOARD_NUGGET1_1': 'dig_nugget1', 'QUEST_DIG_BOARD_NUGGET2_1': 'dig_nugget2', 'QUEST_DIG_BOARD_NUGGET3_1': 'dig_nugget3',
    'QUEST_DIG_BOARD_DIAMOND1': 'dig_diamond1', 'QUEST_DIG_BOARD_DIAMOND2': 'dig_diamond2',
    'QUEST_DIG_BOARD_DIAMOND3': 'dig_diamond3', 'QUEST_DIG_BOARD_DIAMOND4': 'dig_diamond4',
    'QUEST_DIG_BOARD_PEBBLES1': 'dig_pebbles1', 'QUEST_DIG_BOARD_PEBBLES2': 'dig_pebbles2', 'QUEST_DIG_BOARD_PEBBLES3': 'dig_pebbles3',
    'QUEST_DIG_BOARD_NUGGET1PART': 'dig_nuggetpart', 'QUEST_DIG_BOARD_PARTICLE_WALL_0': 'dig_wallpart',
    'QUEST_DIG_BOARD_DIGBARGLOW': 'dig_barglow', 'QUEST_DIG_STREAK': 'dig_streak',
}
IMAGES.update({
    'QUEST_DIG_BOARD_CENTER_BOTTOM': 'dig_edge_b', 'QUEST_DIG_BOARD_CENTER_LEFT': 'dig_edge_l',
    'QUEST_DIG_BOARD_CENTER_RIGHT': 'dig_edge_r', 'QUEST_DIG_BOARD_CENTER_TOP_HIGHLIGHT': 'dig_edge_t_hi',
    'QUEST_DIG_BOARD_CENTER_LEFT_HIGHLIGHT': 'dig_edge_l_hi', 'QUEST_DIG_BOARD_CENTER_RIGHT__HIGHLIGHT': 'dig_edge_r_hi',
    'QUEST_DIG_BOARD_CENTER_BOTTOM_HIGHLIGHT': 'dig_edge_b_hi',
    'QUEST_DIG_BOARD_GRASS_LEFT': 'dig_grass_l', 'QUEST_DIG_BOARD_GRASS_RIGHT': 'dig_grass_r',
    'QUEST_DIG_BOARD_HYPERCUBE': 'dig_hypercube', 'QUEST_DIG_BOARD_BOTTOM_OVERLAY': 'dig_bottom_overlay',
    'WEIGHT_CAP': 'wt_cap', 'WEIGHT_FILL': 'wt_fill', 'WEIGHT_FILL_MASK': 'wt_fillmask',
    'WEIGHT_GLASS_BACK': 'wt_glassback', 'WEIGHT_GLASS_FRONT': 'wt_glassfront',
    'BALANCE_RIG_SIDE_CHAIN': 'rig_sidechain', 'BALANCE_RIG_TOP_CHAIN': 'rig_topchain',
    'BUTTERFLY_FLOWER_FLOWER': 'bfly_flower', 'BUTTERFLY_FLOWER_QUEST_STEM': 'bfly_stem',
    'PARTICLES_DANGERSNOW_HARD_1_SNOWFLAKE': 'p_snowflake', 'PARTICLES_DANGERSNOW_HARD_2_ICECHUNK': 'p_icechunk',
    'PARTICLES_ICE_STORMY_0_SHARD': 'p_iceshard', 'PARTICLES_ICESTORM_COL_STEAM_0_WATERFALL0040': 'p_steam4',
})
# poker
IMAGES.update({
    'POKER_BKG': 'pk_bkg', 'POKER_LONG_BKG': 'pk_longbkg', 'POKER_SCORE_BKG': 'pk_scorebkg', 'POKER_SCORE_BOARD': 'pk_scoreboard',
    'POKER_SCORE_GLOW': 'pk_scoreglow', 'POKER_DECK': 'pk_deck', 'POKER_DECK_SHADOW': 'pk_deckshadow',
    'POKER_SKULL': 'pk_skull', 'POKER_LARGE_SKULL': 'pk_largeskull', 'POKER_BAR_SKULL': 'pk_barskull',
    'POKER_LIGHT_LIT': 'pk_lightlit', 'POKER_LIGHT_UNLIT': 'pk_lightunlit',
    'POKER_SKULL_BAR_COVER': 'pk_barcover', 'POKER_SKULL_CRUSHER_BAR': 'pk_crusherbar', 'POKER_SKULL_CRUSHER_BKG': 'pk_crusherbkg',
    'POKER_SKULL_CRUSHER_BORDER': 'pk_crusherborder', 'POKER_SKULL_CRUSHER_GLOW': 'pk_crusherglow',
    'POKER_SKULL_SLASH': 'pk_skullslash', 'POKER_SLASH_SHADOW': 'pk_slashshadow',
    'CARDS_BACK': 'card_back', 'CARDS_DECK': 'card_deck', 'CARDS_DECK_SHADOW': 'card_deckshadow', 'CARDS_FACE': 'card_face',
    'CARDS_FRONT': 'card_front', 'CARDS_SHADOW': 'card_shadow', 'CARDS_SMALL_FACE': 'card_smallface',
    'SKULL_COIN_SET1': 'coin_set1', 'SKULL_COIN_SET2': 'coin_set2', 'SKULL_COIN_SET3': 'coin_set3', 'SKULL_COIN_SET4': 'coin_set4',
    'SKULL_COIN_SIDE': 'coin_side',
})

# PopAnim animations exported as baked JSON (+ their images)
IMAGES.update({
    'CRYSTALBALL': 'crystalball', 'CRYSTALBALL_GLOW': 'crystalball_glow', 'CRYSTALBALL_SHADOW': 'crystalball_shadow',
    'MAIN_MENU_BEJEWELED': 'mm_logo', 'MAIN_MENU_HELP_BUTTON': 'mm_help', 'MAIN_MENU_QUIT_BUTTON': 'mm_quit',
    'MAIN_MENU_STARS_STAR2': 'mm_star2', 'MAIN_MENU_STARS_STAR3': 'mm_star3',
    '2DONLY_MAINMENU_FOREGROUND': 'mm_foreground',
})

BADGES = ['ANNIHILATOR', 'ANTE_UP', 'BEJEWELER', 'BLASTER', 'BUTTERFLY_BONANZA', 'BUTTERFLY_MONARCH', 'CHROMATIC',
          'DIAMOND_MINE', 'ELECTRIFIER', 'GLACIAL_EXPLORER', 'HEROES_WELCOME', 'HIGH_VOLTAGE', 'ICE_BREAKER', 'INFERNO',
          'LEVELORD', 'RELIC_HUNTER', 'STELLAR', 'SUPERSTAR', 'THE_GAMBLER', 'TOP_SECRET']
for _b in BADGES:
    IMAGES['BADGES_BIG_' + _b] = 'badge_' + _b.lower()
IMAGES.update({
    'BADGES_BIG_BRONZE': 'badge_t1', 'BADGES_BIG_SILVER': 'badge_t2', 'BADGES_BIG_GOLD': 'badge_t3',
    'BADGES_BIG_PLATINUM': 'badge_t4', 'BADGES_BIG_ELITE': 'badge_t5',
    'BADGES_SMALL_ICONS': 'badge_icons', 'BADGES_SMALL_ICONS_GREY': 'badge_icons_grey', 'BADGES_SMALL_RINGS': 'badge_rings',
    'AWARD_GLOW': 'award_glow', 'TOOLTIP': 'tooltip',
})

PAMS = {
    'mineui': 'quest/dig/DiamondMineUI/DiamondMineUI',
    'lightningui': 'anims/lightningUI/lightningUI',
    'lightninguibottom': 'anims/lightningUIbottom/lightningUIbottom',
    'iceui': 'quest/inferno/IcestormUI/IcestormUI',
    'icefill': 'quest/inferno/IcestormFill/IcestormFill',
    'icecolumn1': 'anims/column1/column1',
    'icecolumn2': 'anims/column2/column2',
    'frostpanic': 'anims/frostpanic/frostpanic',
    'spider': 'anims/spider/spider',
}

DIG_ITEMS = ['ABICUS', 'ANVIL', 'ASTROLABE', 'AXE', 'BELL', 'BOOK', 'BOOTS', 'BOWARROW', 'BOWL', 'BRUSH', 'CLOCK',
             'COMB', 'CREST', 'DAGGER', 'DISH', 'FLUTE', 'FORK', 'FROG', 'GAUNTLET', 'GEAR', 'HAMMER', 'HARP', 'HELMET',
             'HORN', 'HORSESHOE', 'KEY', 'LAMP', 'MACE', 'MASK', 'POT', 'SCROLL', 'SEXTANT', 'STAFF', 'TELESCOPE',
             'TRIDENT', 'URN', 'VASE']
for _i, _n in enumerate(DIG_ITEMS):
    IMAGES['QUEST_DIG_BOARD_ITEM_' + _n] = 'dig_item%d' % _i
# plain files (no resource id) relative to images/<res>/
EXTRA_IMAGES = {
    'main_menu/Bejeweled': 'logo',
    'main_menu/quit button': 'mm_quitbutton',
    'main_menu/help button': 'mm_helpbutton',
    'main_menu_stars/star1': 'mm_star',
    'loader_popcap': 'loader_popcap',
}
for _n in ['11', '12', '20', '21', '22', '23', '25', '26', '27', '28']:
    EXTRA_IMAGES['quest/dig/back_layout/' + _n] = 'dig_deco' + _n

# Classic mode backgrounds, in level order (level N uses entry (N-1) % len)
BACKGROUNDS = [
    'treehouse_waterfall', 'jungle_ruins_path', 'floating_rock_city', 'rock_city_lake',
    'desert_pyramids_sunset', 'snowy_cliffs_castle', 'fairy_cave_village', 'Lion_tower_cascade',
    'crystal_mountain_peak', 'horse_forest_tree', 'water_bubble_city', 'canyon_wall_castle',
    'pointy_ice_path', 'tube_forest_night', 'lantern_plants_world', 'bridge_shroom_castles',
    'dark_cave_thing', 'water_fall_cliff', 'pointy_ice_path_purple', 'flying_sail_boat',
]
MENU_BACKGROUND = 'main_menu'
EXTRA_BACKGROUNDS = ['Overworld']
ICE_BACKGROUNDS = ['snowy_cliffs_castle', 'pointy_ice_path', 'pointy_ice_path_purple', 'crystal_mountain_peak']

FONTS = ['flaregothicbold80score', 'FlareGothicBold100', 'flaregothicbold42', 'flaregothic55',
         'FLAREGOTHIC32', 'flaregothic25', 'flaregothicbold20', 'flaregothicboldbutton66',
         'flaregothicbold66', 'flarebold120sidebar']

# name -> (subsong index, loop)
MUSIC = {
    'menu': (2, True),
    'classic': (9, True),
    'classic_lose': (4, False),
    'loading': (1, False),
    'zen': (10, True),
    'speed': (3, True),
    'butterflies': (20, True),
    'butterflies_lose': (21, False),
    'mine': (28, True),
    'mine_lose': (29, False),
    'icestorm': (18, True),
    'icestorm_lose': (19, False),
    'poker': (22, True),
    'poker_lose': (23, False),
}

# ---------------------------------------------------------------- helpers

def log(*a):
    print(*a, flush=True)


def extract_pak():
    if os.path.exists(os.path.join(EXTRACTED, 'properties', 'resources.xml')):
        log('[pak] already extracted')
        return
    pak = os.path.join(GAME_DIR, 'main.pak')
    qbms = os.path.join(ROOT, 'tools', 'quickbms')
    os.makedirs(EXTRACTED, exist_ok=True)
    log('[pak] extracting', pak)
    subprocess.run([qbms, '-o', os.path.join(ROOT, 'tools', 'popcap_pak.bms'), pak, EXTRACTED],
                   check=True, stdout=subprocess.DEVNULL)


def parse_resources():
    """Return {ID: attrs} for images of the chosen resolution (plus common ones)."""
    xml = open(os.path.join(EXTRACTED, 'properties', 'resources.xml'), encoding='latin-1').read()
    res = {}
    group_res = None
    for line in xml.splitlines():
        m = re.match(r'<Resources id="([^"]+)"(?: res="(\d+)")?', line)
        if m:
            group_res = m.group(2)
            continue
        if not line.startswith('<Image '):
            continue
        if group_res not in (RES, None):
            continue
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', line))
        attrs.update({k: v for k, v in re.findall(r'(\w+)=(-?\d+)(?=[\s/])', line)})
        iid = attrs['id'][len('IMAGE_'):]
        if iid in res and group_res is None:
            continue
        res[iid] = attrs
    return res


def image_meta(path_png, attrs):
    im = Image.open(path_png)
    meta = {'w': im.width, 'h': im.height}
    for k in ('x', 'y', 'cols', 'rows'):
        if k in attrs:
            meta[k] = int(attrs[k])
    return meta


def build_images(manifest):
    res = parse_resources()
    jobs = []
    for iid, name in IMAGES.items():
        if iid not in res:
            log('  !! missing resource', iid)
            continue
        attrs = res[iid]
        base = os.path.join(EXTRACTED, attrs['path'].replace('\\', '/'))
        jobs.append((name, base, attrs))
    for rel, name in EXTRA_IMAGES.items():
        jobs.append((name, os.path.join(EXTRACTED, 'images', RES, rel), {}))

    def work(job):
        name, base, attrs = job
        out = os.path.join(OUT, 'img', name + '.png')
        if not os.path.exists(out) and not convert(base, out):
            return name, None
        return name, image_meta(out, attrs)

    with ThreadPoolExecutor(max_workers=os.cpu_count()) as ex:
        for name, meta in ex.map(work, jobs):
            if meta is None:
                log('  !! could not convert', name)
            else:
                manifest['images'][name] = meta
    log('[img] %d images' % len(manifest['images']))


def build_backgrounds(manifest):
    bgdir = os.path.join(EXTRACTED, 'images', RES, 'backgrounds')

    def work(name):
        d = os.path.join(bgdir, name)
        out = os.path.join(OUT, 'bg', name + '.jpg')
        if not os.path.exists(out):
            cand = [os.path.join(d, 'flattenedpam.jp2'), os.path.join(d, 'flattenedpam.jpg'),
                    os.path.join(d, name + '_1920x1200.jp2')]
            src = next((c for c in cand if os.path.exists(c)), None)
            if not src:
                return None
            im = load(src).convert('RGB')
            if im.size != (1920, 1200):
                im = im.resize((1920, 1200), Image.LANCZOS)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            im.save(out, quality=88, optimize=True)
        return name

    with ThreadPoolExecutor(max_workers=os.cpu_count()) as ex:
        done = [n for n in ex.map(work, BACKGROUNDS + [MENU_BACKGROUND]) if n]
        list(ex.map(work, [b for b in ICE_BACKGROUNDS + EXTRA_BACKGROUNDS if b not in BACKGROUNDS]))
    manifest['backgrounds'] = [n for n in done if n != MENU_BACKGROUND]
    manifest['menuBackground'] = MENU_BACKGROUND
    manifest['iceBackgrounds'] = ICE_BACKGROUNDS
    manifest['extraBackgrounds'] = EXTRA_BACKGROUNDS
    log('[bg] %d backgrounds' % len(done))


def parse_font(path):
    """Parse a PopCap font descriptor into a JSON friendly structure."""
    text = open(path, encoding='latin-1').read().replace('\r', '')
    defines = {}
    layers = {}
    order = []

    def parse_list(s):
        s = s.strip()
        # tuples of numbers -> lists, quoted chars/strings -> strings
        items, depth, cur, quote = [], 0, '', None
        assert s[0] == '(' and s[-1] == ')', s[:40]
        s = s[1:-1]
        i = 0
        while i < len(s):
            c = s[i]
            if quote:
                cur += c
                if c == quote:
                    quote = None
            elif c in '\'"':
                quote = c
                cur += c
            elif c == '(':
                depth += 1
                cur += c
            elif c == ')':
                depth -= 1
                cur += c
            elif c == ',' and depth == 0:
                items.append(cur.strip())
                cur = ''
            else:
                cur += c
            i += 1
        if cur.strip():
            items.append(cur.strip())
        out = []
        for it in items:
            if it.startswith('('):
                out.append([float(v) if '.' in v else int(v) for v in it[1:-1].split(',')])
            elif it[0] in '\'"':
                out.append(it[1:-1])
            else:
                out.append(float(it) if '.' in it else int(it))
        return out

    def val(tok):
        tok = tok.strip()
        if tok in defines:
            return defines[tok]
        if tok.startswith('('):
            return parse_list(tok)
        if tok[0] in '\'"':
            return tok[1:-1]
        return float(tok) if '.' in tok else int(tok)

    # statements end with ';' (Define may span 2 lines)
    for stmt in re.split(r';\s*\n', text):
        stmt = ' '.join(stmt.split('\n')).strip()
        if not stmt:
            continue
        m = re.match(r'(\w+)\s+(.*)$', stmt, re.S)
        if not m:
            continue
        cmd, rest = m.groups()
        if cmd == 'Define':
            name, v = rest.split(None, 1)
            defines[name] = parse_list(v)
        elif cmd == 'CreateLayer':
            layers[rest.strip()] = {'name': rest.strip()}
            order.append(rest.strip())
        elif cmd.startswith('Layer'):
            lname, args = rest.split(None, 1)
            L = layers[lname]
            key = cmd[len('Layer'):]
            if key in ('SetCharWidths', 'SetCharOffsets', 'SetImageMap', 'SetKerningPairs'):
                a, b = args.split(None, 1)
                L[key] = (val(a), val(b))
            else:
                L[key] = val(args)

    out_layers = []
    for lname in order:
        L = layers[lname]
        if lname.endswith('__MOD'):
            continue
        chars, widths = L['SetCharWidths']
        _, offsets = L['SetCharOffsets']
        _, rects = L['SetImageMap']
        glyphs = {}
        for i, ch in enumerate(chars):
            glyphs[ch] = {'w': widths[i], 'o': offsets[i], 'r': rects[i]}
        kern = {}
        if 'SetKerningPairs' in L:
            pairs, values = L['SetKerningPairs']
            kern = {p: v for p, v in zip(pairs, values) if v}
        out_layers.append({
            'name': lname, 'image': L['SetImage'], 'ascent': L.get('SetAscent', 0),
            'height': L.get('SetHeight', 0), 'pointSize': L.get('SetPointSize', 0),
            'offset': L.get('SetOffset', [0, 0]), 'order': L.get('SetBaseOrder', 0),
            'colorMult': L.get('SetColorMult', [1, 1, 1, 1]),
            'tags': L.get('RequireTags', []), 'glyphs': glyphs, 'kern': kern,
        })
    out_layers.sort(key=lambda l: l['order'])
    return {'layers': out_layers}


def build_fonts(manifest):
    fdir = os.path.join(EXTRACTED, 'fonts', RES)
    files = {f.lower(): f for f in os.listdir(fdir)}
    for fname in FONTS:
        src = files.get(fname.lower() + '.txt')
        if not src:
            log('  !! missing font', fname)
            continue
        font = parse_font(os.path.join(fdir, src))
        key = fname.lower()
        for L in font['layers']:
            img = L['image']
            base = next((os.path.join(fdir, f[:-len('_.gif')]) for f in files.values()
                         if f.lower() == img.lower() + '_.gif'), os.path.join(fdir, img))
            out_name = 'font_' + img.lower()
            out = os.path.join(OUT, 'fonts', out_name + '.png')
            if not os.path.exists(out):
                convert(base, out)
            L['image'] = out_name
        with open(os.path.join(OUT, 'fonts', key + '.json'), 'w') as f:
            json.dump(font, f, separators=(',', ':'))
        manifest['fonts'].append(key)
    log('[font] %d fonts' % len(manifest['fonts']))


def build_sounds(manifest):
    sdir = os.path.join(EXTRACTED, 'sounds')
    odir = os.path.join(OUT, 'sfx')
    os.makedirs(odir, exist_ok=True)
    for f in sorted(os.listdir(sdir)):
        if f.endswith('.ogg'):
            name = f[:-4].lower().replace(' ', '_')
            dst = os.path.join(odir, name + '.ogg')
            if not os.path.exists(dst):
                shutil.copy(os.path.join(sdir, f), dst)
            manifest['sounds'].append(name)
    log('[sfx] %d sounds' % len(manifest['sounds']))


def build_music(manifest):
    mod = os.path.join(EXTRACTED, 'music', 'Bejeweled3_suite.mo3')
    odir = os.path.join(OUT, 'music')
    os.makedirs(odir, exist_ok=True)

    def work(item):
        name, (sub, loop) = item
        out = os.path.join(odir, name + '.ogg')
        if not os.path.exists(out):
            wav = os.path.join(odir, name + '.wav')
            subprocess.run(['openmpt123', '--batch', '--quiet', '--no-float', '--subsong', str(sub),
                            '--repeat', '0', '--samplerate', '44100', '--force', '-o', wav, mod],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # strip trailing silence on one-shot jingles
            af = [] if loop else ['-af', 'areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse']
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, *af,
                            '-c:a', 'libvorbis', '-q:a', '5', out], check=True)
            os.remove(wav)
        return name, loop

    with ThreadPoolExecutor(max_workers=4) as ex:
        for name, loop in ex.map(work, MUSIC.items()):
            manifest['music'][name] = {'loop': loop}
    log('[music] %d tracks' % len(manifest['music']))


def build_pams(manifest):
    import pam
    from pam_preview import image_base
    odir = os.path.join(OUT, 'pam')
    os.makedirs(odir, exist_ok=True)
    manifest['pams'] = []
    for key, rel in PAMS.items():
        path = os.path.join(EXTRACTED, 'images', RES, rel + '.pam')
        data = pam.to_json(pam.parse(open(path, 'rb').read()))
        for i, im in enumerate(data['images']):
            base = image_base(path, im['name'])
            name = '%s_%d' % (key, i)
            out = os.path.join(odir, name + '.png')
            if base and (os.path.exists(out) or convert(base, out)):
                im['file'] = name
            else:
                im['file'] = None
        with open(os.path.join(odir, key + '.json'), 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        manifest['pams'].append(key)
    log('[pam] %d animations' % len(manifest['pams']))


def build_affirmations(manifest):
    # Zen mode mantras come from the text files shipped next to the game exe
    src = os.path.join(GAME_DIR, 'affirmations')
    odir = os.path.join(OUT, 'affirmations')
    os.makedirs(odir, exist_ok=True)
    manifest['affirmations'] = []
    if os.path.isdir(src):
        for f in sorted(os.listdir(src)):
            if f.endswith('.txt'):
                shutil.copy(os.path.join(src, f), os.path.join(odir, f))
                manifest['affirmations'].append(f)
    log('[zen] %d affirmation sets' % len(manifest['affirmations']))


def main():
    extract_pak()
    os.makedirs(OUT, exist_ok=True)
    for d in ('img', 'bg', 'fonts', 'sfx', 'music'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    manifest = {'images': {}, 'fonts': [], 'sounds': [], 'music': {}, 'backgrounds': []}
    build_images(manifest)
    build_backgrounds(manifest)
    build_fonts(manifest)
    build_sounds(manifest)
    build_music(manifest)
    build_affirmations(manifest)
    build_pams(manifest)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    log('done ->', OUT)


if __name__ == '__main__':
    main()
