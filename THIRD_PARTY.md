# Third-party material

Kuddes' own code is licensed under the AGPL-3.0 (see `LICENSE`). This file
lists the parts in this repository that come from others, under their own
terms, and what is left out on purpose.

## Included, with a free license

| What | Where | Source | License |
| --- | --- | --- | --- |
| Farm-Fresh web icons by FatCow | `public/icons/` | [FatCow](https://www.fatcow.com/free-icons) | CC BY 3.0 (credited in the site footer) |
| Fonts | `public/fonts/body/`, `public/fonts/names/` | Google Fonts | SIL Open Font License 1.1 (`OFL.txt` in each folder) |
| Country flags in the Landen gadget | loaded from the Twemoji CDN | [Twemoji](https://github.com/jdecked/twemoji) | CC BY 4.0 |
| Textures | `public/textures/` | tutorialsforblender3d.com, fetched by `tools/fetch_textures.py` | royalty-free, for commercial and noncommercial use |

## Included, origin to check

These come from old websites and messengers; who owns them is not clear. If
you run a public server and want to be careful, replace them or remove them.

| What | Where | Note |
| --- | --- | --- |
| Smileys | `public/smileys/` (421 GIFs) | classic forum smileys, collected from the web |
| MSN-style emoticons | `public/msn/` | in the style of MSN Messenger (Microsoft) |
| Messenger sounds | `public/sounds/` | the "nudge" and typing sounds |
| Animated cursors | `public/cursors/` | classic web cursors, collected from the web |

## Not included

| What | Why | How to add it to your own server |
| --- | --- | --- |
| Mario Kart Wii sprites (`public/mkwii/`) | Nintendo's artwork | Optional. Without them the Mario Kart gadget shows names only. |
| BuddyPoke (`web/`) | a separate project | See DEPLOY.md, "BuddyPoke". Without it the BuddyPoke boxes stay empty. |
| Bejeweled 3 art, sound and music (`games/bejeweled/web/assets/`) | PopCap/EA's game files | Built from your own installed copy of the game with `games/bejeweled/tools/build_assets.py` (see its README). Without them the game doesn't load. "Bejeweled" is a trademark of Electronic Arts; this project isn't affiliated with them. |

## Services used at runtime

Some features talk to outside services when a member uses them:

- YouTube (youtube-nocookie.com);
- SomaFM;
- Open-Meteo;
- Cloudflare Turnstile (optional);
- Google or Cloudflare STUN servers;
- your own mail service.

The privacy statement (`src/pages/PrivacyPage.tsx`) describes each of them.
Adapt it to your server.
