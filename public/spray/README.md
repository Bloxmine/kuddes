# Spray Wall

A graffiti spray-paint simulator on a blank concrete wall. No build step or dependencies.

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`).
Add `?demo` to the URL to see a sample piece (`?demo&wall=brick` picks a wall).

The ☰ menu (top left) has the wall choice (concrete, brick, cinder block, stucco,
metal shutter), drippiness, distance, cap, save, sound and clean. It fades out as soon as
you pick up a can and comes back when you put it down. Your settings are remembered.

## Controls

| Action | Input |
| --- | --- |
| Pick up a can | Click it (or press 1–0) |
| Spray | Hold the left mouse button |
| Distance to the wall | Scroll wheel, `[` / `]`, or the slider |
| Fat / skinny cap | `F` or the menu |
| Next wall | `W` or the menu |
| Swap basic ⇄ special cans | `C` or the ⟳ button next to the cans |
| Put the can back | Right-click, `Esc`, or click its cap on the ground |
| Save a photo / clean the wall | `S` / `Del` |
| Sound on/off | `M` |

## Special cans

The ⟳ button next to the cans throws the basic set off-screen and tosses in the special set.
Press it again to swap back at any time. If you're holding a can when you swap, you keep it.
When you put it down, it gets thrown after the rest of its set.

| Can | Effect |
| --- | --- |
| Gold, Silver, Copper, Chrome | Metallic: light and dark reflection bands plus bright flakes |
| Holographic | Iridescent: colour shifts across the wall |
| Gold Glitter, Disco Glitter | Glitter flakes that twinkle on the wall |
| Star Confetti, Gold Stars | Tiny foil stars that catch the light |
| Rainbow | Colour cycles while you spray |

## Playing together (on Kuddes)

On Kuddes the wall runs in an iframe on `/graffiti` (`src/pages/games/SprayPage.tsx`), and
multiplayer uses the site's own game rooms instead of PeerJS:

1. Pick a friend and click **Uitnodigen**. That makes a game of kind `spray`, so your friend gets
   the usual invite pop-up.
2. When they click **Meedoen**, both of you are on `/spellen/spray/<id>`. The host's wall
   (surface, drippiness, what's already sprayed) is copied to the guest, and after that you spray
   on the same wall in real time.

`js/net.js` is the wall's side: the same `Spray.Net` interface as before, talking to the page with
`postMessage`. The page (`src/features/spray/SprayWall.tsx`) carries the messages over the game
room: a WebRTC data channel when a direct line works (with the site's STUN/TURN servers), or
through the server otherwise, bundled about 8 times a second. The snapshot's PNG bytes go as
base64, split into parts of 14 kB. A session has no winner; **Stoppen** ends it, and it never
counts as a played game.

The page also sends the site's colour tokens (so the menu matches the member's theme), your
progress from your account, and your friend's name for the tag. The wall reports the cans you
use and the photos you save, for the Graffitimuur achievements (`server/routes/spray.ts`).

## Secret row

Spray with every basic and special can at least once (the menu shows "Bussen geprobeerd: n / 20").
That unlocks a third row, which ⟳ then cycles to: basic → special → secret.
Progress is saved in the browser and, on Kuddes, on your account.

| Can | Effect |
| --- | --- |
| Wood Grain, Galaxy, Camo, Zebra, Marble, Leopard | Pattern paint: the pattern is fixed to the wall, so spraying reveals it |
| Vampire | Near-black blood red that drips far more easily |
| Plasma, Lava | Animated: keeps moving on the wall after you spray it |
| RGB | Any colour: click the swatch above the can, or press `P` while holding it |

## How it works

- **Paint** (`js/paint.js`): every droplet is a separate dot blended into a full-resolution
  pixel buffer, so overlapping colours mix. The spray is a Gaussian cone whose width grows
  with distance. Up close it's tight and wet and spits big droplets. Far away the droplets
  dry in the air, so you get a dusty speckle.
- **Drips**: a wetness grid adds up paint that hasn't dried yet. When a spot gets too wet,
  a drip runs down in the mixed colour there, thins out, and ends in a bead. The
  drippiness setting controls how much paint it takes to run and how far the drips go.
- **Walls** (`js/wall.js`): five procedural surfaces. Each one builds a colour layer and a
  relief layer (joints, pores, ridges, cracks). The relief layer is overlay-blended on top of the paint, so the
  texture shows through it.
- **Cans** (`js/can.js`, `js/main.js`): procedurally drawn sprites. The can in your hand
  follows the cursor on a spring and swings like a pendulum. It gets larger the farther
  you hold it from the wall and casts a soft shadow onto the wall.
- **Animated paint**: plasma and lava aren't stored in the pixel buffer. Each one has its
  own mask, and every frame a low-resolution moving pattern is drawn through that mask.
  Normal paint sprayed on top reduces the mask, so it covers the animation like real paint.
- **Sound** (`js/audio.js`): Web Audio synthesis for the hiss, the mixing-ball rattle
  when you shake the can, the cap popping off, and the can clanking back down.
