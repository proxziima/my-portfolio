# Reel Portfolio — project context

Everything an agent (or you) needs to rebuild this page inside a Next.js app.
The working single-file implementation is in `reference/reel.html` — **that file is the
source of truth**. When this document and that file disagree, the file wins.

---

## 1. What the page is

A personal portfolio for one person who works as three different engineers. It is a
single letter — one flowing bio, a work list and a project list — that **rewrites itself**
when you change discipline, plus a 3D figure that morphs to match.

Three roles: `se` (Software engineer), `ai` (AI engineer), `civil` (Civil engineer).
Order matters everywhere: `['se', 'ai', 'civil']`.

Visual language is lifted from <https://pedromarques.me> (measured, not guessed —
see §3). Everything else is original.

### The six interactive systems

| # | System | Lives in | One line |
|---|--------|----------|----------|
| 1 | **Reel** | `plate1.js` | The role in the `<h1>` is a 3-sided WebGL drum that rolls between disciplines. |
| 2 | **Wheel** | `wheel1.js` | Hovering that role expands it into a 3-row picker; the mouse wheel changes role. |
| 3 | **Word morph** | `logic1.js` | The bio is one letter in three vocabularies; an LCS diff animates only the words that differ. |
| 4 | **Wall switch** | `logic1.js` | A photographic rocker switch (17-frame sprite atlas) that toggles the theme, with a synthesized click. |
| 5 | **Blowout** | `blowout1.js` | Ten fast clicks pop the bulb: blackout, vignette, the switch falls with physics, then a puff and recovery. |
| 6 | **Curious mode** | `curious1.js` | A switch inside the Ted Lasso line reveals layout guides and handwritten notes, including formulas on the 3D model. |

---

## 2. Load order and global contract

The single file is nine parts concatenated in this exact order. They share one script
scope — later parts read globals declared by earlier ones.

```
head1.html   <title>, <link> fonts, three.js <script>, all CSS   (opens nothing)
body1.html   markup                                              (no script)
data1.js     opens <script>; ROLES, ORDER, A(), CUR, SIGIL       ← content
logic1.js    state, morph, theme, wall switch, setRole()         ← the spine
bulb1.js     BULB_MP3 (base64 data URI)                          ← replaced in the port
blowout1.js  the blowout sequence                                ← reads audio(), root, reduce
wheel1.js    the role picker                                     ← reads ORDER, ROLES, current, setRole
curious1.js  guides + annotations                                ← writes hooks.annot etc.
plate1.js    all three.js; closes </script>                      ← reads hooks, current, ORDER
```

**Globals the parts share** (declare these in a module/context when porting):

- `ROLES`, `ORDER`, `CLASSES`, `SIGIL`, `CUR`, `A()` — content (data1)
- `current` — the active role key; `setRole(key)` is the only way to change it
- `reduce` — `matchMedia('(prefers-reduced-motion:reduce)').matches`
- `root` — `document.documentElement`
- `hooks` — the seam between the DOM layer and the WebGL layer:
  `{ reel(key), plate(key), repaint(), annot(on), curiousRelayout(), isCurious() }`
  They start as no-ops; `plate1.js` and `curious1.js` overwrite them once they initialise.
  **This is what keeps the page alive when WebGL is unavailable** — `plate1.js` bails out
  early, leaves the no-ops in place, and swaps the drum for a plain text button.
- `audio()` — lazily creates/resumes the single shared `AudioContext`
- `isDark()`, `syncWall()`, `rockerTo(frame, rapid)`, `applyTheme()`, `themeTransition()`
- `blowout.register()` / `blowout.active`

**`setRole(key)` is the fan-out point.** It sets `current`, then calls
`hooks.reel(key)` always, and — only if the role actually changed —
`morphBio(key)`, `fillLists(key)`, `hooks.plate(key)`, `hooks.curiousRelayout()`,
writes `localStorage`, and replaces the hash.

---

## 3. Design tokens — measured from the reference site

Read off `pedromarques.me` with `getComputedStyle`, not eyeballed.

### Colour (light)

```
--paper      #FBFAF7    page ground
--ink        #171716    headings, strong
--ink-link   #292927    link text
--ink-soft   #686863    body copy, captions, secondary
--rule       #C4C4BE    link underlines
--rule-soft  #E4E2DC    hairlines, borders
--chip       #EDEBE5    favicon chips
--accent     #3155FF    curious mode only
--line3d     #3A3A34    the three.js ink
```

### Colour (dark — mine, the reference's dark palette was not fully extracted)

```
--paper #141513  --ink #F0EFEA  --ink-link #E2E1DB  --ink-soft #9A9A93
--rule #3E3E38   --rule-soft #2A2A26  --chip #26261F  --accent #8FA4FF  --line3d #D6D4CB
```

Three states, not two — this matters:

```css
:root { /* complete light palette */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark */ } }
:root[data-theme="dark"] { /* dark again, so an explicit choice wins */ }
```

### The page background

Three fixed radial gradients over `--paper` (exact values from the reference):

```css
background-image:
  radial-gradient(1088px 608px at -8% -4%,  var(--glow-a), transparent 64%),
  radial-gradient(864px 992px at 108% 32%,  var(--glow-b), transparent 72%),
  radial-gradient(992px 672px at 18% 108%,  var(--glow-c), transparent 70%);
background-attachment: fixed;
/* light: rgba(255,255,255,.76) / rgba(176,142,91,.06) / rgba(55,52,45,.035) */
/* dark:  rgba(255,255,255,.035) / rgba(176,142,91,.07) / rgba(0,0,0,.25)    */
```

### Metrics

| Thing | Value | Note |
|---|---|---|
| Text column | **600px** | reference is 586; widened on request. `main` is 632 (600 + 2×16 gutter) |
| Body copy | 15px / 24px | `--ink-soft` |
| `h1` | 28px, line-height 1.22, letter-spacing −.012em | name weight **620**, role line weight **430** |
| Section gap | 64px | `section { margin-top: 64px }` |
| `h2` | 15px / weight 500 / `--ink-soft` / 24px bottom margin | |
| Link underline | 2px, offset 2.7px, colour `--rule` | on an inner `<span>`, not the `<a>` |
| Favicon chip | 16×16, radius 3px, margin-right 4.5px, vertical-align −3.2px | |
| Work row | grid `1fr auto`, gap 16px, row gap 14px | years right-aligned, tabular-nums |
| Bio paragraph gap | 16px (grid `gap`) | |

Fonts: **Inter** (400/430/500/620/700) everywhere, **Caveat** (500/600) for the
handwritten curious-mode notes only.

---

## 4. The wall switch — ported 1:1 from the reference

The reference's own markup, CSS and script were read through the browser and
reimplemented. Keep all of this; it is what makes it feel real.

### Markup

```html
<div class="theme-switcher">
  <button class="theme-wall-toggle" aria-label="Turn the lights off" aria-pressed="false">
    <span class="theme-wall-stage" data-motion-ready="true">
      <img class="theme-wall-image theme-wall-state theme-wall-state--light" src="…/rocker-on.webp"  width="530" height="700">
      <img class="theme-wall-image theme-wall-state theme-wall-state--dark"  src="…/rocker-off.webp" width="530" height="700">
      <canvas class="theme-wall-image theme-wall-motion" width="212" height="280"></canvas>
    </span>
  </button>
</div>
```

The two `<img>`s are the no-JS / no-canvas fallback. Once the atlas decodes, the script
sets `data-motion-ready="true"`, which **hides both images and shows the canvas** — from
then on every frame is drawn by JS.

### Atlas

`public/theme-switch/rocker-atlas.webp` — 1060×1120, a 5-column grid of **17 frames**,
each 212×280. Frame 0 = lights on (rocker up), frame 16 = lights off (rocker down).

```js
const n = Math.round(p * 16);                    // p is 0…1
ctx.drawImage(atlas, (n % 5) * 212, Math.floor(n / 5) * 280, 212, 280, 0, 0, 212, 280);
```

Validate before switching over — if `naturalWidth !== 212*5` or
`naturalHeight !== 280*Math.ceil(17/5)`, throw and stay on the `<img>` fallback.

### Animation

- duration `200ms × |target − current|`, eased with smoothstep `t*t*(3−2t)`, on rAF
- **a click during a flip snaps that flip to its end first**, so every click starts from a
  rested rocker (this was the "glitching when I click fast" bug)
- clicks under 300ms apart shorten the flip to **115ms** so it keeps pace
- `prefers-reduced-motion` → jump straight to the frame

### Sizing and shadow

```css
.theme-switcher { position:absolute; top:36px; right:-4px; width:2.8rem; height:3.7rem; }
.theme-wall-stage {
  filter: drop-shadow(0 .075rem .045rem var(--wall-contact))
          drop-shadow(.025rem .24rem .22rem var(--wall-cast));
}
/* light: contact #26221c5c  cast #312c2421   dark: #00000085 / #00000038 */
```
Below 900px it becomes `position: fixed; top: 16px; right: 16px`.

### The click — the reference's exact synth

65ms of noise from an LCG seeded at 42, with a two-spike envelope, through a bandpass:

```js
const r = .065, buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * r), ctx.sampleRate);
let o = 42;
for (let i = 0; i < a.length; i++) {
  o = o * 16807 % 2147483647;
  const w = o / 2147483647 * 2 - 1, s = i / ctx.sampleRate;
  a[i] = w * (Math.exp(-s * 132) + (s > .016 ? Math.exp(-(s - .016) * 220) * .52 : 0));
}
// bandpass: 1450Hz going to light, 1050Hz going to dark; ramps to ×0.74 over r; Q 0.72
// gain: 1e-4 → 0.115 (light) / 0.105 (dark) in 2ms → 1e-4 at r
```

### Theme transition

On every toggle, stamp `data-theme-transition` on `<html>` for **380ms**. Every element
that sets its own colour must join that transition — body, headings, `.bio`, `strong`,
links **and their underline colour**, chips, years, descriptions, `h2`, captions, the
wheel. Missing one is visible: half the page fades, half snaps. The WebGL colours are
lerped over the same window in the render loop (`colourSettled` flag in `plate1.js`).

**Do not** cancel the transition on rapid clicks — CSS retargets a running transition
smoothly; removing it mid-flight is what made the chips flicker.

---

## 5. The blowout

`blowout.register()` is called on every switch click. It keeps a timestamp list.

- window **4000ms**, threshold **10 clicks**
- from the **6th** click in that window, the filament complains: `data-flicker="1…4"` on
  `<html>` drives a keyframe on a full-screen layer (`#flick`), **not** a filter on
  elements — filtering the elements is what made the chips stutter
- the 10th click runs the sequence:

1. play `bulb-explode.mp3` through the shared `AudioContext` (decoded on the 2nd fast
   click so it's ready), plus a sine thump 100→36Hz
2. a warm radial flash centred on the switch (`--x`/`--y` custom props), 550ms
3. force `data-theme="dark"` + `data-blackout`; a vignette (`.bo-veil`) closes in from the
   switch position over 900ms
4. clone the switch into `.bo-fall`, hide the mounted one (`opacity:0`, **not**
   `visibility:hidden` — the clone copies the canvas pixels), and run real physics:
   `g = 2700 px/s²`, wall bounces at 0.5, floor restitution 0.34 with a thud whose gain
   tracks impact speed, friction 0.82, and a settle onto the nearest right angle
5. 16 shards spray from the same point with their own gravity and fade
6. at **3300ms**: 11 smoke puffs bloom at the mount (Web Animations API), a low breathy
   poof, the switch scales back in from inside the puff (0.45 → 1.09 → 1)
7. at +160ms the previous theme is restored **while the veil still hides the room**
8. at +520ms the veil lifts over 750ms; at +1500ms everything is cleaned up and
   `active = false`

Clicks are ignored while `active`. Under reduced motion it dims and recovers with no
physics.

---

## 6. The word morph

The three bios are deliberately **the same sentences with different vocabulary**. That is
what makes the morph readable — most words stay, the specialist terms swap.

```
'Hi, I'm Vinicius, a 🇧🇷 Brazilian <strong>{software engineer}</strong> and builder,
 though most weeks that just means <strong>{backend plumber}</strong>. I love the early
 stage of a {system}, when the <strong>{contract}</strong> is still messy…'
```

Algorithm, in `logic1.js`:

1. `splitStrong()` — rewrite `<strong>a b c</strong>` into three single-word `<strong>`s,
   so no animated span is multi-word (a multi-word inline-block cannot wrap → forced
   line breaks)
2. `tok()` — regex tokenizer that keeps a whole `<a class="fav">…</a>` or
   `<button class="curiosity-trigger">…</button>` as one token, and **records the exact
   whitespace that followed each token** (otherwise `<strong>x</strong>.` produces `x .`)
3. `lcs()` — DP longest common subsequence over token text → `keepA` / `keepB` sets
4. mark the dropped spans `.out` (blur 2px, translateY −.32em, opacity 0)
5. after **240ms** swap `innerHTML`, mark inserted spans `.in`, then remove the class on
   the second rAF with a `(i % 14) * 9ms` stagger
6. `flushPending()` — a new morph arriving mid-flight clears the pending timer and renders
   the pending role instantly first, so fast scrolling can't leave the bio half-rewritten

The spans emit spaces *outside* the span so text wraps normally.

**Porting note:** keep this imperative, driving `innerHTML` through a ref. React's
reconciler will fight the two-phase class dance and the per-word transition delays.

---

## 7. The picker wheel

The role in the `<h1>` is a `<button class="reel">` (the WebGL drum) wrapped in
`.reelwrap`. On hover/focus, `#wheel` is shown over it.

- 3 visible rows of **42px**; the current role is locked in the middle slot behind a
  raised `.sel` plate; the window is masked top and bottom so it reads as a wheel
- the list is **three copies of ORDER (9 rows)**; `idx` starts at `3 + ORDER.indexOf(current)`
  and `translateY(-(idx-1)*42px)`. After each animated step, if `idx` leaves `[3,5]` it is
  silently renormalised by ±3 with the transition off → infinite loop in both directions
- wheel events: `preventDefault`, accumulate `deltaY`, step when `|acc| ≥ 26`, cooldown
  **170ms** (so a trackpad flick doesn't spin through all three)
- each step calls `setRole` immediately — the role commits when it lands in the middle
- also: pointer drag (touch), ←/→/↑/↓ when focused, click a row to jump, Escape closes

---

## 8. The three.js figure

One `LineSegments` of **760 segments** that morphs between the three models, plus a
`Points` cloud for what moves through them, plus a hidden annotation layer.

**Morph technique:** every model is built as a list of `[x0,y0,z0,x1,y1,z1]` segments,
then `resample(segs, 760)` redistributes them proportionally to length so all three
models have *the same segment count*. Morphing is then a straight per-vertex lerp with a
per-segment random delay (0…0.4) and an ease-out — which is why it looks like the drawing
is reassembling itself rather than cross-fading.

| Role | Model | What moves |
|---|---|---|
| `se` | edge box → gateway → 3 services (with log lines) → partitioned queue (cylinder) → 2 database drums, on a ground plate | particles pick one of 6 real routes through the topology and travel it |
| `ai` | a 4-layer net floating above a wireframe loss surface (14×9) | activations pulse along the edges; 3 balls roll down `DESCENT` — 64 real finite-difference gradient steps computed on that surface |
| `civil` | Warren truss bridge: two braced planes, deck beams, road centre line, abutments with ramps, piers on footings, 3 wavy river lines | a truck (cab, box, 6 wheels) drives the deck and dips at mid-span; river drift |

Camera: perspective 32°, `z = 7.3` (9.8 under 460px). The group drifts on its own, follows
the pointer, and yields to a drag. Colours come from `--line3d` and are lerped, never set.

### Curious-mode annotations (§9) drawn on the model

Separate `LineSegments` per role, faded in only when curious mode is on **and** the morph
has settled (`pT > .85`), coloured `--accent`:

- **se** — arrivals (λ) into the gateway, a bracket down the stack for time-in-system (W)
- **ai** — one forward path lit, a loss bracket at the output, a gradient arrow walking back
- **civil** — a UDL across the deck (load line + 11 arrows), reaction arrows at the piers,
  the span dimension line, and a dashed parabolic moment diagram

---

## 9. Curious mode

The word *curious* in the Ted Lasso line is a `role="switch"` button with the reference's
26×18 pill (thumb travels 8px, track goes `--accent` when on). Toggling it draws an
overlay (`#curiosity-overlay`, `position:absolute`, `pointer-events:none`):

- dashed rails at both column edges
- a width bracket with a monospace label reading the **live measured width**
- section guides labelled `bio` / `figure` / `work` / `projects`
- 64px gap markers between links→work and work→projects
- handwritten **Caveat** notes at ±1° with leader lines (`::before` bar + `::after` tick),
  `data-side="left|right"` decides which side the leader comes from
- per-role formula notes beside the model (Little's law / cross-entropy + backprop +
  recall@k + softmax / UDL + M=wL²/8 + δ=5wL⁴/384EI + R=wL/2 + L=52m)

Guides stagger in 35ms apart. The layout is **self-healing**: it refuses to run while the
column has no width, re-runs on resize, on a `ResizeObserver` over `main`, after fonts
load, after every role switch, and a 400ms interval compares a layout key and re-runs if
the column moved. (Without this, the guides drew in the top-left corner inside the
artifact iframe, which sizes itself after load.)

Notes are hidden below 1040px — there is no margin to put them in.

---

## 10. Porting to Next.js

### Recommended shape

```
app/
  layout.tsx          fonts, the no-FOUC theme script, <html suppressHydrationWarning>
  page.tsx            server component: renders the letter from lib/roles.ts
  globals.css         everything from reference/parts/head1.html
components/
  Portfolio.tsx       'use client' — owns role + theme state, renders the rest
  Reel.tsx            the drum (canvas) + Wheel
  Wheel.tsx           the picker
  Bio.tsx             the morphing letter (uses a ref + innerHTML, see §6)
  WallSwitch.tsx      the rocker
  Blowout.tsx         the sequence
  CuriousMode.tsx     the overlay
  Plate.tsx           the three.js figure
lib/
  roles.ts  morph.ts  audio.ts  models.ts  rocker.ts
public/
  theme-switch/*.webp   sound/bulb-explode.mp3
```

### Things that will bite you

1. **FOUC.** The theme must be on `<html>` before first paint. Put a small
   `dangerouslySetInnerHTML` script in `<head>` that reads `localStorage` and sets
   `data-theme`. Add `suppressHydrationWarning` to `<html>`.
2. **three.js version.** The reference uses r128 from a CDN. On modern three
   (0.160+) colour management is on by default and will shift these hex values.
   Either `THREE.ColorManagement.enabled = false` or convert with
   `setHex(v, THREE.SRGBColorSpace)`. All other APIs used here are unchanged.
3. **`'use client'` everywhere interactive.** `page.tsx` can stay a server component and
   render the *initial* role's text for SEO; hydration then takes over.
4. **The `hooks` object** is a hand-rolled event bus. In React, replace it with a small
   context (`{ role, setRole, theme, curious }`) plus refs for the imperative bits —
   but keep the "WebGL is optional" contract: `Plate.tsx` must be able to fail and leave
   the page fully usable.
5. **One AudioContext.** Create it lazily on first user gesture (autoplay policy) and
   share it between the click, the bulb and the physics thuds. A module-level singleton
   in `lib/audio.ts` is fine.
6. **The MP3** is a real file here, not a data URI. Decode it on the 2nd fast click
   (`fetch` → `arrayBuffer` → `decodeAudioData`) so it's ready by the 10th.
7. **`next/font`** for Inter and Caveat; expose them as CSS variables and reference those
   in `globals.css` so the canvas text (`430 28px Inter`) matches the DOM.
8. **The rocker canvas** must be redrawn when the theme changes from outside (system
   preference, or another tab) — watch `data-theme` with a `MutationObserver`.

### Content

`lib/roles.ts` holds everything. All prose is **placeholder** — three parallel bios with
the same skeleton, work rows, projects, RPG class cards (name/level/stats/flavour) and
figure captions. Swap the strings; the skeleton is what makes the morph work, so keep the
sentences parallel across the three roles.

---

## 11. Files in this package

```
reference/reel.html        the complete working page (open it in a browser, it just runs)
reference/parts/*          the nine editable parts it is built from (cat them in order)
public/theme-switch/*      rocker atlas + the two state images
public/sound/*             the bulb explosion
docs/*                     this document, the porting checklist
```

To rebuild the single file from parts:

```sh
cat head1.html body1.html data1.js logic1.js bulb1.js blowout1.js \
    wheel1.js curious1.js plate1.js > reel.html
```

(`bulb1.js` is not included — it was only the base64 copy of the MP3. Either regenerate it
with `base64 public/sound/bulb-explode.mp3` wrapped as
`const BULB_MP3 = 'data:audio/mpeg;base64,…'`, or use the file directly as the port does.)
