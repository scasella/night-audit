# Night Audit — Tape 01

A playable vertical slice of a found-footage horror game, built as a single web
page for Safari on the foldable iPhone Duo.

It is 3:12 a.m. on November 18, 1989, at the Sundown Motor Inn, and the power is out. You are the night
auditor, filming everything for the owner's insurance. Find the three fuses
someone pulled from the breaker, put them back, and get out the front doors.
Something that lives in Room 9 goes where the light is.

The look is a late-80s consumer camcorder recording to VHS: 4:3, soft
~240-line luma, chroma that smears and arrives late, snow and chroma noise,
interlaced fields that comb when you pan, timebase wobble and flagging,
head-switching noise, dropouts, tube lag that leaves trails behind lights, and
a date stamp burned into the picture so it degrades with it. With the lamp off
the camera rides its gain up and the picture turns muddy and grainy. That look
is a genre convention. The setting, creature, story, notes, levels, title and
art are original to this project.

## Play it

**https://scasella.github.io/night-audit/** — open it in Safari on the phone.
GitHub Pages serves it over HTTPS, so the fold APIs are available when Safari's
feature flags are on (see below).

## Run it locally

```bash
python3 serve.py
```

This serves the folder at `http://localhost:8767`. In the iOS Simulator, open
that address in Safari.

On a real iPhone Duo, use one of these:

- **Same Wi-Fi.** Run `python3 serve.py 8767 --lan`, then open
  `http://<your-mac-name>.local:8767` on the phone. Everything plays. Plain
  http is not a secure context, and whether Safari still exposes the fold APIs
  there was not tested, so use the tunnel or the FOLD LAYOUT setting for book
  and tabletop.
- **HTTPS tunnel** (full Duo support). Run `python3 serve.py`, then in a second
  terminal run `cloudflared tunnel --url http://localhost:8767` and open the
  `https://….trycloudflare.com` address it prints. Anyone with that link can
  load the page while the tunnel runs; stop it with Ctrl-C.

Add it to the Home Screen (Share ▸ Add to Home Screen) to play without Safari's
toolbars. Safari on iPhone has no fullscreen API for pages.

**Fold detection needs two Safari feature flags.** In iOS 27 Safari the Device
Posture API and Viewport Segments API are experimental and off by default: a
fresh iPhone Duo simulator reports neither, while one with Settings ▸ Apps ▸
Safari ▸ Advanced ▸ Feature Flags ▸ *Device Posture API* and *Viewport Segments
API* turned on reports both. With them on, book and tabletop are picked
automatically. Without them, the game uses the theater layout open and the
handheld layout closed, and SETTINGS ▸ FOLD LAYOUT can force BOOK or TABLETOP.

three.js 0.160.0 loads from jsDelivr, and the fonts from Google Fonts, so the
phone needs an internet connection the first time.

## Controls

| Touch | Keyboard / mouse | |
|---|---|---|
| Drag on the left side | WASD / arrows | Move. A stick appears under your thumb. Push it all the way to run, which is loud. |
| Drag anywhere else | Mouse drag, or click to lock the pointer | Look |
| Tap the picture, or USE | E / Space | Use what's in the centre (the prompt says what) |
| LAMP | F | Lamp on/off. You see further; so does it. |
| LEDGER | Tab / L | Objectives, notes, and a map that fills in as you explore |
| ❚❚ | Esc / P | Pause |

With the lamp off the camera rides its gain up: grainy, muddy and short range,
but the Guest has to be close to see you. Wardrobes, lockers and
closets hide you, unless it watched you get in. When the picture tears, it is
close. Getting caught rewinds the tape to the last checkpoint.

## Duo layouts

The layout is picked from what Safari reports, never from a device check
(`js/layout.js`).

| Posture | What Safari reports | Layout |
|---|---|---|
| Closed (outer screen) | 382×580, 1 segment | **Handheld**: viewfinder on top, camcorder control deck below |
| Open, flat | 951×543, 1 segment | **Theater**: 4:3 picture, controls in the side bars |
| Half-open, held like a book | 2 side-by-side segments, crease at x≈475 | **Book**: viewfinder on the left page; the ledger and map on the right page. Notes open on the right page and the game keeps running. |
| Half-open, turned | 2 stacked segments, crease at y≈350 | **Deck**: viewfinder above the crease, controls below it |
| Any other shape | — | Theater if wider than 1.15:1, otherwise handheld |

Book and tabletop need the two Safari feature flags above, or SETTINGS ▸ FOLD
LAYOUT set to BOOK or TABLETOP (or `?fold=book` / `?fold=tabletop`).

Any change of layout pauses the tape (`❚❚ PAUSED · FOLD DETECTED`): closed to
open, rotating, or flat to book/tabletop when Safari reports the fold. Tap
RESUME to carry on where you were. Layout changes wait 250 ms, because
Safari reports in-between sizes while the hinge moves.

## How it's built

```
index.html        page, OSD, deck, ledger, menus (all CSS inline)
js/main.js        game loop, player, scripting, checkpoints, autopilot (dev)
js/level.js       the motel: tile map, doors, lights, props, items, hiding spots
js/world.js       geometry, per-vertex baked lighting in 16 switchable channels
js/textures.js    every texture, drawn on canvas at load
js/post.js        the camcorder: HDR scene target, camera pass, tape pass
js/guest.js       the creature: model, senses, A*, patrol director
js/physics.js     collision, line of sight, pathfinding
js/audio.js       all sound, synthesised with Web Audio
js/layout.js      Duo posture and viewport-segment handling
js/input.js       stick, look, buttons, keyboard and mouse
js/ui.js          DOM side: layouts, OSD, captions, ledger, notes, menus
js/story.js       captions, notes, objectives, ending
serve.py          dev server (no-store, POST /__log → .devlog.jsonl)
```

- **Light.** Static lights (neon sign, vending machine, TV, lantern, the
  fixtures that come back with the power) are baked into the vertices with a
  2D occlusion test on the tile grid, so nothing leaks through walls. Each
  light belongs to one of 16 channels whose brightness is a uniform. Flicker,
  lightning, the power coming back and the lights bursting in the finale are
  all channel changes. Only the camcorder lamp is a real-time light with
  shadows.
- **Camera and tape.** The scene renders at 400×300 into a half-float
  target. A camera pass at that size adds lens glow, horizontal tape smear and
  vertical CCD smear from bright lights, auto gain, tone mapping and tube lag
  (it reads its own previous frame). A tape pass at screen resolution then
  burns in the date stamp and plays it back: interlaced fields from the current
  and previous frames, luma low-pass with ringing, wide late chroma, snow,
  chroma noise, timebase wobble, flagging, head-switching noise, tracking bands
  and dropouts. If the median frame time stays over 26 ms, it first drops the
  canvas to 1× pixel ratio and the scene to 352×264, then to 320×240 with no
  lamp shadows. TAPE EFFECTS ▸ LIGHT
  tones it all down.
- **The Guest** sees further when your lamp is on, when you stand in light,
  and when you run. It hears footsteps, doors and the desk bell. It opens
  doors, searches where it lost you, and a director biases its patrol toward
  your part of the building without walking straight at you.

## Dev switches

| URL | Effect |
|---|---|
| `?dev` | Dev hooks (`window.__na`) and the log mirrored to `serve.py` |
| `?dev&scene=corridor\|hunt\|office\|room9\|fuses\|finale` | Start at a set point in the story |
| `?dev&autopilot&speed=3` | A bot plays the whole tape against the live Guest at 3× speed and logs each step |
| `?dev&autopilot&video` | A real-time bot run paced for recording: 5 s on the title, smooth turns, notes held up to read, lamp off when the Guest is near |
| `?dev&autopilot&lamp` | The bot keeps the lamp on the whole time |
| `?dev&quality=fixed` | The quality governor never steps down |
| `?dev&nopause` | Don't pause when the page is hidden |

## What was tested

In the iPhone Duo simulator (iOS 27.1 Safari), served from `serve.py`:

- **Rendering.** three.js r160 loads from jsDelivr and runs on WebGL2 with
  half-float targets. The simulator reported 60 fps in every layout, with the
  three-pass camera and tape chain. The quality governor never stepped down.
  That is the Mac's GPU; frame rate on a real Duo was not measured.
- **Postures.** On a simulator whose Safari has the two feature flags on, the
  probe page (`probe.html`) saw closed 382×580, open 951×543, book with the
  crease at x=475.5, and tabletop with it at y=349.5. On a fresh simulator with
  default Safari settings, neither `navigator.devicePosture` nor
  `window.viewport` exists. There the game used handheld closed and theater
  open. Book and tabletop were checked with the FOLD LAYOUT override.
- **Touch, with simulated taps.**
  - Title menu → brightness calibration → DONE → game.
  - LAMP toggles. USE relabels itself (READ, CHECK, HIDE, LEAVE).
  - USE on the breaker opens Pruitt's note, and PUT IT DOWN arms the hunt.
  - "HIDE IN CLOSET" appears through normal aiming. Inside, you look out
    through the slats, then LEAVE.
  - Holding the stick while dragging to look moves and turns at once.
  - Unfolding mid-game switches to theater and shows `PAUSED · FOLD DETECTED`. RESUME continues.
- **Whole game, with the creature active.** The autopilot (`?autopilot`)
  played from the first frame to the end card four times, with 0 rewinds each
  time: three full runs (5:42, 3:56 and 4:49 of tape time) and one finale-only
  run.
  - A variant that keeps the lamp on all the time died over and over at first,
    by hiding while the creature watched. Two changes fixed that:
    - the creature only knows which hiding spot you're in if it saw you get in
      from 6 m or closer;
    - after three deaths at one checkpoint it no longer homes in on your area,
      sees less far, and chases 10% slower.
  - After those changes the lamp-on variant escaped too, in 4:38 with 1 rewind.
  - Rewinds restore the checkpoint, and the creature comes back behind you
    after a 14-second grace period.
  - Bugs these runs found and that are fixed:
    - closed doors couldn't be focused, so a player couldn't open them;
    - items on the floor were out of reach;
    - A* failed when the goal tile held furniture;
    - the creature could catch you before the finale began;
    - after a rewind it respawned on the only route forward.
- **A recorded run.** `recordings/night-audit-playthrough-open-duo.mp4` is a
  real-time bot run (`?dev&autopilot&video&nopause&quality=fixed`) on the
  iPhone Duo simulator lying open and flat, in the theater layout. It escaped
  in 5:55 of tape time with all six notes and 0 rewinds. The Simulator's
  recorder captures the picture only, so the video has no sound.
- **No page errors** were logged across all sessions.

Not tested:

- A real iPhone Duo.
- Sound. Safari showed its audio indicator after the first tap, so the
  AudioContext runs, but nothing was listened to.
- Home Screen (standalone) mode.
- Plain-http LAN play.
- The tunnel.
- Whether the fold APIs work over http.
