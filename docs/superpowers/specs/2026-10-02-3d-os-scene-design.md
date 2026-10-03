# Desk scene with an interactive OS on the monitor — design

Date: 2026-10-02. Supersedes the figure sections of
`2026-09-29-portfolio-rewrite-design.md` and all of
`2026-10-02-3d-performance-design.md` (the Spline scene it tuned is replaced).

Reference: [henryheffernan.com](https://henryheffernan.com/), whose two source
repositories sit (untracked) in `docs/3d-scene-os/portfolio-website` (the 3D
site, three.js) and `docs/3d-scene-os/portfolio-inner-site` (the 2D OS, React).
Both are MIT licensed (Henry Heffernan, 2024).

## 1. What the reference does (live QA, 2026-10-02)

Tested in the in-app browser at 1280×720.

| Step | Observed |
|---|---|
| Load | Black BIOS screen types resource lines, then a "Click start to begin" popup with a START button (also a WebGL check and a mobile warning). |
| START | Camera flies in from far away to an **idle** shot: the whole desk from above, slowly drifting. A "Click anywhere to begin" prompt sits at the bottom. |
| Click anywhere | Camera moves to the **desk** keyframe: monitor centred, keyboard and mouse in the foreground. The camera follows the pointer gently (parallax). A name / title / clock overlay with a mute and a free-cam toggle types itself in at the top left. |
| Pointer over the monitor | Camera glides (2 s, ease-out) to the **monitor** keyframe: the screen fills the view. The screen is a live web page (a Windows-98-style desktop: shortcuts, a "My Showcase" window with HOME / ABOUT / EXPERIENCE / PROJECTS / CONTACT, a Start bar with a clock). Links work, windows drag, minimise and resize. |
| Pointer leaves the monitor | Camera returns to the desk keyframe (1 s). If a button is held while leaving, it waits for the release. |
| Click outside the desk | Back to the idle shot. Free cam enables an orbit control. |

Technically (from the source): a three.js `WebGLRenderer` draws baked models
(three small GLBs, 4 k / 3 k / 3.6 k triangles, each with one baked JPEG, as
`MeshBasicMaterial`, no lights); a `CSS3DRenderer` draws a second scene
holding a `CSS3DObject` whose element is a 1280×1024 `<iframe>` of the OS site,
placed at the monitor's screen (position (0, 950, 255), tilted −3°). A
transparent `NoBlending` plane in the GL scene at the same transform punches a
hole so the GL models occlude the CSS layer correctly. The iframe is
cross-origin, so the OS posts `mousemove` / `mousedown` / `keydown` to the
parent through `postMessage`, which re-dispatches them for the camera and the
sound effects. A full-screen shader overlay adds noise; video textures add
static and smudges to the screen.

## 2. Decision: the Spline scene cannot host the OS screen

The question was whether the current Spline desk (`public/spline/scene.splinecode`,
`@splinetool/runtime` 2.0.62) can render the OS iframe on its monitor.

A CSS3D screen needs, every frame, the camera that draws the GL scene: its
`projectionMatrix`, `matrixWorldInverse`, and (for an orthographic camera) its
frustum bounds. The Spline runtime's public `Application` type
(`node_modules/@splinetool/runtime/runtime.d.ts`) exposes no camera at all:
only `_controls: any` and a `controls: any` getter, plus object lookups
(`findObjectByName`, `getAllObjects`) that return `SPEObject`s with position,
rotation and scale. The only way in is the undocumented `_camera` / `_scene`
internals, which the perf branch already had to reach for (`_renderer`,
`_resize`) and which the runtime does not guarantee between versions.

Checked on the running page (2026-10-02, through the React fiber to the loaded
`Application`): `_camera` is an `OrthographicCamera` at zoom 0.35, the scene
holds 333 objects (every keyboard key is a `Text` mesh plus a `Cube` mesh),
and the monitor's screen is a mesh named `screen`. So a CSS3D screen could be
bolted on through `_camera`, but it would ride on private fields, an
orthographic camera (the desk → monitor zoom would have to be authored as
Spline states and driven blind) and a scene of hundreds of draw calls, 4.5 MB
plus a runtime that streams WASM chunks, which the performance work in
`2026-10-02-3d-performance-design.md` only partly offset.

So: no supported way, and a fragile, heavy unsupported one. Per the brief, the
reference's Blender-made GLBs are used. The scene code is asset-agnostic
(§3.4): the user's own desk can replace them later by exporting it from Spline
as GLB (Export → 3D → GLTF) with a baked texture, without code changes beyond
`config.ts`.

## 3. Design

### 3.1 Shape

Two pieces, both in `apps/web` (one deploy, one origin):

1. **The desk scene** (`features/desk/`): a plain three.js engine (no
   react-three-fiber: one renderer, one camera rig, ~6 small modules, fewer
   bytes and no reconciler in the frame loop) mounted by a thin React wrapper
   inside the existing `Figure` box (600×400 at 3:2, in the letter column).
2. **The OS** (`features/os/` + route `/os`): a React desktop (shortcuts,
   windows, taskbar) rendered as its own page with its own root layout, fed by
   the same CMS data as the letter. It is the iframe's `src` and also works on
   its own at `/os`.

Same origin is deliberate: the scene reads the iframe's events directly
(`iframe.contentWindow`), so no `postMessage` protocol, no second deploy, and
the OS shows the same Work / Projects / Content as the page. Should the OS ever
move to another origin, `features/desk/screen-events.ts` is the one file to
swap for a `postMessage` bridge.

### 3.2 Routes

```
app/
  (site)/layout.tsx      ← today's root layout (fonts, ThemeScript, globals.css)
  (site)/page.tsx, error.tsx, blog/**        ← moved, URLs unchanged
  (os)/os/layout.tsx     ← second root layout: <html><body>, os.css, no theme script
  (os)/os/page.tsx       ← force-dynamic; getPortfolio() → <Desktop data />
  api/**                 ← unchanged
```

Next allows one root layout per route group. The portfolio's `body` styles
(paper, glow gradients, `main` column) must not leak into the OS, hence the
second root layout rather than a nested one.

### 3.3 Scene engine (`features/desk/`)

| File | Responsibility |
|---|---|
| `config.ts` | Constants, scene units as in the reference: `MODEL_SCALE = 900`; `SCREEN = { width: 1280, height: 1024, position: (0, 950, 255), tiltDeg: -3, padding: 32 }`; `KEYFRAMES` (§3.5); asset paths under `/desk/`; `MAX_PIXEL_RATIO = 2`. |
| `assets.ts` | `loadDesk(paths, onProgress?): Promise<Object3D[]>`: `GLTFLoader` + `TextureLoader` for each (glb, texture) pair; every mesh gets one `MeshBasicMaterial({ map })` with `flipY = false`, `colorSpace = SRGBColorSpace`, scaled by `MODEL_SCALE`. Rejects on any failure. No Draco: the GLBs declare no required extensions. |
| `monitor-screen.ts` | `createMonitorScreen(element, SCREEN)`: returns `{ css: CSS3DObject, gl: Object3D[] }`. `css` wraps `element` at the screen transform. `gl` is the occluder (transparent `MeshLambertMaterial`, `NoBlending`, `DoubleSide`) at the same transform plus four thin bezel planes (`0x48493f`) enclosing a shallow depth, as in the reference, so the iframe reads as set into the monitor. Pure geometry: testable without WebGL by checking positions/rotations. |
| `ease.ts` | `cubicBezier(x1, y1, x2, y2): (t) => number` (Newton-Raphson on x, as CSS does) and `quinticInOut`. Pure. |
| `keyframes.ts` | Pure maths: `deskKeyframe(aspect, pointer, previous, reduce)` and `monitorKeyframe(aspect)` return `{ position, target }` as plain `{ x, y, z }` triples (the aspect correction and the parallax smoothing of §3.5). Unit-tested without three. |
| `camera-rig.ts` | `class CameraRig { goTo(key, ms, ease); update(dtMs, pointer): boolean }`. Holds `position` and `target` vectors, tweens them between the keyframes from `keyframes.ts`, writes `camera.position` + `lookAt`. Returns `true` when the camera moved (the engine's dirty flag). |
| `monitor-focus.ts` | Pure reducer for the button guard of §3.5: `{ over, pressed, focused }` plus an event → next state, and `wantsMonitor(state)`. |
| `screen-events.ts` | `watchScreen(iframe, onChange)`: feeds `monitor-focus.ts` from the iframe element (`pointerenter`, `pointerleave`, `focus`, `blur`), `pointerdown` / `pointerup` in both the parent window and, once loaded (same origin), `iframe.contentWindow`; calls `onChange(wantsMonitor)` on every change of the answer. Returns an unsubscribe. |
| `engine.ts` | `createDeskEngine({ host, screenElement, pixelRatio }): DeskEngine` with `load()`, `start()`, `stop()`, `resize(w, h)`, `setPixelRatio(r)`, `pointer(x, y)`, `dispose()`. Builds `WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })` with a transparent clear colour, a `CSS3DRenderer`, a `PerspectiveCamera(35, aspect, 10, 900000)`, the GL and CSS scenes, the rig and the screen. Render on demand: a frame renders both renderers only when the rig reports movement or `resize` flagged dirty. `dispose()` releases geometries, materials, textures and the renderer. |
| `DeskScene.tsx` | Client component. Renders the host `<div>` (the two renderer DOM elements are appended into it: CSS layer below, GL canvas above with `pointer-events: none`) and the `<iframe src="/os" title="Desktop">` that `monitor-screen.ts` places. `useEffect`: create engine → `load()` → `start()`; `onFail` on rejection. `useInView(host)` → `start()` / `stop()`. `ResizeObserver` on the box → `resize()`. `cappedPixelRatio(devicePixelRatio)` → `setPixelRatio`. Pointer moves over the box → `pointer()`. Unmount → `dispose()`. |
| `pixel-ratio.ts` | `cappedPixelRatio(dpr) = min(max(dpr, 1), MAX_PIXEL_RATIO)`, finite-guarded. Replaces `scene-pixel-ratio.ts` (the fitted variant existed for the scaled Spline stage, which goes). |

Rendering order: the CSS3D layer is a sibling below the WebGL canvas. The
occluder writes depth with no colour, so where models stand in front of the
screen the canvas shows them, and where the screen is visible the canvas is
transparent and the iframe shows through. Both renderers take the same camera.

### 3.4 Assets

`apps/web/public/desk/`: `computer.glb` + `computer.webp`, `decor.glb` +
`decor.webp`, `environment.glb` + `environment.webp`, copied from the reference
(`static/models/**`) with the baked JPEGs converted to WebP (quality 85, same
dimensions) with `sharp` from `apps/payload`'s dependencies. Expected total:
~0.3 MB of geometry and well under 1.5 MB of textures, against 4.5 MB today.
`environment.glb` holds the back wall, desk and chair; it is loaded because the
desk and the chair are part of the shot. Its `Background` node is removed after
load so the page's paper shows through the transparent canvas in both themes.

Replacing the desk later: export the Spline scene as GLB with a baked texture,
drop the files in `public/desk/`, and update `config.ts`. The README's
"Updating the desk model" section is rewritten accordingly.

### 3.5 Camera and interaction

Keyframes (scene units; the reference's values, re-framed for a 3:2 box):

| Key | Position | Target | Notes |
|---|---|---|---|
| `desk` | (0, 1800, 5500) | (0, 500, 0) | Default. z is corrected by the box aspect as the reference does (`origin.z + aspect × 3000 − 1800`). Parallax: target and position ease toward the pointer offset (×400 and ×200 scene units) with the reference's 0.05 / 0.025 smoothing. |
| `monitor` | (0, 950, 2000) | (0, 950, 0) | z corrected by aspect so the 1280×1024 screen fills the box's height with a small margin. |

The far "idle" orbit and the free cam are dropped: in a 600 px box the idle
shot is a thumbnail, and orbiting is scope without purpose here (YAGNI).

State machine (`monitor-focus.ts`):

- `over` set by `pointerenter` / cleared by `pointerleave` on the iframe;
  `pressed` by `pointerdown` inside the iframe / `pointerup` anywhere (the
  parent window and the iframe's window); `focused` by the iframe's `focus` /
  `blur` (keyboard users reach the screen with Tab).
- `wantsMonitor = over || focused || pressed`. Leaving while pressed therefore
  keeps the monitor until release, as the reference does.
- Transitions: → `monitor` in 2000 ms with `cubicBezier(0.13, 0.99, 0, 1)`;
  → `desk` in 1000 ms with `quinticInOut`. A new transition cancels the
  running one from the current position (no snap).

Under `prefers-reduced-motion: reduce` transitions take 0 ms and parallax is
off (the rig still renders once per state change).

Pointer devices without hover (`(hover: none)`): the iframe gets
`pointer-events: none` (a scaled, tilted iframe is not usable by touch) and the
scene stays a visual. For everyone, a small link after the caption,
"Open the desktop →" (`/os`), is the accessible and the mobile route to the OS.

### 3.6 Loading and failure

- The figure keeps today's behaviour: the box holds 3:2 while loading and
  collapses to the caption if the engine fails (`onFail`). The scene chunk
  (`three` + engine) is `next/dynamic` with `ssr: false`, mounted when the box
  comes within 200 px (`useInView`, unchanged).
- The canvas fades in once the first frame has rendered (`data-loaded`).
- The iframe is created with the scene (it is part of the CSS layer) and shows
  the OS's own boot screen (§3.7) while the models stream.
- WebGL unavailable (`WebGLRenderer` throws) → `onFail`.
- Off screen: `stop()` cancels the frame loop (no WebGL work at all). Tab
  hidden: `requestAnimationFrame` is throttled by the browser.

### 3.7 The OS (`features/os/`)

A compact Windows-98-style desktop. Design size 1280×1024 inside the iframe;
at `/os` it fills the viewport (windows size from the viewport like the
reference's `useInitialWindowSize`).

| File | Responsibility |
|---|---|
| `window-manager.ts` | Pure reducer: `open(id)`, `close(id)`, `minimize(id)`, `focus(id)`, `toggleFromTaskbar(id)`; windows keyed by app id with `zIndex` (monotonic counter) and `minimized`. |
| `apps.ts` | The app registry: `{ id, title, icon, component }` for `showcase` and `credits`. `showcase` opens on boot. |
| `Desktop.tsx` | Client root: boot → desktop; owns the reducer; renders shortcuts, open windows (`minimized` → hidden, not unmounted), the taskbar, and the shutdown sequence. |
| `Boot.tsx` | A short BIOS-style text screen (≈1.2 s, typed lines, skippable by click/key; instant under reduced motion). |
| `Shutdown.tsx` | Start → Shut down: a typed console log that "fails" and reboots to the desktop (the reference's first sequence, text replaced). |
| `Window.tsx`, `use-window-geometry.ts` | Frame, title bar (icon, title, minimise / maximise / close), inset content, status bar; drag by the title bar and resize by the corner with pointer events, moving a translate during the gesture and committing geometry on release (`min 520×220`); maximise toggles to the viewport. |
| `Taskbar.tsx` | Start button + Start menu (Shut down…), one tab per open window (active / minimised states), clock (minute precision). |
| `Shortcut.tsx` | Icon + label; single click selects, double click or Enter opens (a real `<button>`). |
| `apps/Showcase.tsx` | The explorer window: a left nav (Home, About, Work, Projects, Content, Contact) and pages built from `Portfolio` data: About from the default discipline's bio paragraphs, Work / Projects / Content as lists with chips, Contact from the contact links. Internal `page` state, no router. |
| `apps/Credits.tsx` | What this is: the reference it follows, the stack, a link to the repository. |
| `icons.tsx` | Inline SVG pixel icons (computer, folder, document, close, minimise, maximise, start flag). No bitmap icons or fonts are copied from the reference (its fonts are Microsoft's). |
| `os.css`, `os-tokens.css` | Global for the OS root only: reset, `image-rendering: pixelated`, `user-select: none`, the palette (`#c0c0c0` light grey, `#808080`, `#000080` blue title bar, `#008080` desktop), type (`Tahoma, 'MS Sans Serif', Arial` at 11 px). Everything else is CSS Modules. |

The OS does not know it is in a monitor: no special code paths for the iframe.

### 3.8 Data flow

```
page.tsx (site) ─ getPortfolio ─▶ Portfolio ─▶ Figure ─▶ DeskScene
                                                           │ iframe src="/os"
page.tsx (os)   ─ getPortfolio ─▶ Desktop ◀────────────────┘
DeskScene
  useInView(host) ────────────▶ engine.start() / stop()
  ResizeObserver(box) ────────▶ engine.resize(w, h)   (dirty)
  pointermove(box) ───────────▶ engine.pointer(x, y)  → rig parallax (dirty)
  watchScreen(iframe) ────────▶ monitorFocus → rig.goTo('monitor' | 'desk')
  engine frame: rig.update(dt) ? render(gl) + render(css) : nothing
```

### 3.9 Removals

- `features/figure/SplineScene.tsx`, `.module.css`, `use-fit-scale.ts`,
  `use-hide-spline-text-proxy.ts`, `scene-pixel-ratio.ts` and their tests.
- `@splinetool/runtime` dependency; `public/spline/scene.splinecode`.
- `Settings.splineSceneUrl`, `sceneUrl`, `DEFAULT_SCENE_URL` in `lib/cms`
  (types, mappers, tests). `Figure` takes no `sceneUrl`.
- The CMS schema keeps its `figure` group and `scenes` collection untouched
  for now (`packages/cms-types/src/payload-types.ts` has unrelated uncommitted
  changes, and dropping fields needs a production migration). Follow-up: remove
  them with a migration.

### 3.11 Full screen (added 2026-10-03)

The reference is a full-viewport experience; in the letter the figure is a
600×400 box, so the OS on the monitor is small. A **Full screen** button next
to the caption expands the figure box to the viewport, where the monitor zoom
puts the 1280×1024 screen at the reference's scale.

- `lib/dom/use-fullscreen.ts`: `useFullscreen(ref) → { on, enter, exit, toggle }`.
  `enter` sets `on` and, where the Fullscreen API exists, calls
  `element.requestFullscreen()` (browser chrome goes too, like the reference);
  `exit` clears `on` and calls `document.exitFullscreen()` if that element is
  the fullscreen one. A `fullscreenchange` that leaves the element (the user
  pressed Esc or switched apps) clears `on`; an Escape `keydown` exits in both
  modes. While `on`, `<html data-fullscreen>` locks page scroll (`base.css`).
  Without the API (iOS Safari) the CSS mode alone applies.
- `Figure`: the box gets `data-full`; `.box[data-full='true']` is
  `position: fixed; inset: 0; z-index: 101` (above the blowout layers at
  97–100) with the paper background (also under `:fullscreen`, whose UA default
  is black). The scene's `ResizeObserver` refits the renderer and the rig's
  aspect, so the desk and monitor poses re-frame for the wide box. An
  **Exit full screen** button sits top-right inside the box while `on`.
- Nothing changes in the engine or the OS.

### 3.10 Sound (in scope since 2026-10-03)

As in the reference, sound belongs to the scene, not to the OS page: the
`/os` page stays silent on its own.

- Samples from the reference repo (MIT), copied to `public/desk/audio/`:
  `mouse-down.mp3`, `mouse-up.mp3`, `key-1.mp3`…`key-6.mp3` (Henry
  Heffernan's foley) and `office.mp3` (the office ambience the reference
  credits to Sound Cassette). The Windows 95 startup sample is Microsoft's and
  is not copied; a short synthesised chime (`lib/audio` style) plays instead.
- `features/desk/ambience.ts` (pure): `ambienceParams(distance)` maps the
  camera's distance to the desk origin to the low-pass cutoff and the level
  exactly as the reference does (`map(d, 0, 10000, 100, 22000) − 3000` Hz,
  `map(d, 1200, 10000, 0, 0.2)` clamped to 0.05–0.1): zoomed into the monitor
  the office goes quiet and muffled.
- `features/desk/audio.ts`: `createDeskAudio()` on the shared `AudioContext`
  from `lib/audio/context.ts`. `unlock()` runs on the first pointer or key
  press in the figure (autoplay policy; a press inside the same-origin iframe
  activates the parent too): it decodes the samples, plays the chime and starts
  the ambience loop through a low-pass filter. `key()` plays a random key
  sample (held keys do not repeat), `mouse('down' | 'up')` the clicks, panned
  slightly (keyboard left, mouse right) in place of the reference's positional
  audio. `setDistance()` applies `ambienceParams` with a short ramp. `setMuted()`
  drives a master gain. `dispose()` stops everything.
- Wiring: `screen-events.ts` also reports the iframe's `pointerdown`,
  `pointerup`, `keydown` and `keyup`; `engine.ts` reports the camera distance
  on every drawn frame (`onFrame`); `DeskScene` connects both to the audio.
- A **Mute** toggle sits in the caption's actions and in the full-screen bar,
  persisted in `localStorage` (`desk-muted`). Default: sound on, as in the
  reference, but nothing plays until the first press.

### 3.12 Credits, as the reference (added 2026-10-03)

The Credits window matches the reference's: a 1100×800 window on a black
page, white serif text, "Credits" and "<host>, <year>" centred at the top, one
section at a time (title, then name / role rows 600 px wide), "Click to
continue…" under it, and a row of dots that counts the seconds until the next
section (5 s) — a click advances at once. Sections: Engineering & Design (the
owner, All); Modeling & Texturing (Henry Heffernan, Mickael Boitte, Sean
Nicolas, who made the models the scene uses); Sound Design (Henry Heffernan,
Sound Cassette); Built with (three.js, Next & React, Payload); Inspiration
(Henry Heffernan, Bruno Simon). Sections fade and rise in with a CSS
animation. `Window` grows a `status` prop for the bottom-left "© Copyright
<year> <name>" and app titles may depend on the data.

### 3.13 Showcase, as the reference (added 2026-10-03)

The Showcase reproduces the reference's layout and type:

- Fonts via `next/font/google` in the OS layout: **Ultra** for display
  headings (the reference's Gastromond) and **Courier Prime** (400/700) for
  text (the reference's Millennium), as `--os-display` / `--os-serif`. Sizes as
  the reference's `index.css`: p 18 px, h1 64 px display, h2 32, h3 24, h4 18,
  list items 16 px apart, justified text blocks, `.site-page-content` with a
  300 px left margin for the sidebar and 64/32/16 px padding, links blue and
  purple once visited.
- **Home**: no sidebar; the name as a 72 px display h1, the discipline title
  as h2, the four section links in a row (16 px padding), all centred.
- **Sidebar** (every other page): 300 px fixed column, 48 px padding; the name
  on two lines in 38 px display type, "Showcase 'YY" as h3, the links as bold
  underlined uppercase h4 32 px apart, the current one marked with the
  reference's small purple ring.
- **About**: h1 "Welcome" (−16 px), h3 "I'm <name>", the bio paragraphs, then
  the reference's bordered strip ("Looking for the full letter?" → the site at
  `/`, in place of the résumé download) .
- **Work**: per entry, the reference's header (h1 company with its URL as an
  h4 link beside it; h3 role with the bold period beside it) and a text block.
- **Projects**: h1 "Projects" / h3 "& Content", a paragraph, then one
  reference-style big button per project (48 px display title, h3 summary).
- **Contact**: h1 "Contact" with the contact links as big square buttons
  (their chips as labels), then the email. No form (there is no backend).
- The window is titled "<name> - Showcase <year>" with "© Copyright <year>
  <name>" in the status bar.

### 3.14 Doom, as the reference (added 2026-10-03)

The reference's js-dos v7 runtime (`public/js-dos/`, GPL-2.0) and its
shareware DOOM bundle (`public/doom.jsdos`, id Software's freely
redistributable shareware episode) are copied as they are. `features/os/apps/doom/`
holds a one-time script loader (`loadJsDos`, which also sets
`emulators.pathPrefix = '/js-dos/'`), a `DosPlayer` port (`Dos(root)` →
`run(bundle)`, `stop()` on unmount) and the `Doom` app; the registry gains
`shortcut` (desk label, "My Showcase" / "Credits" / "Doom" as the reference),
`status` ("Powered by JSDOS & DOSBox") and `barColor` (`#1c1c1c`). The Doom
desktop icon is the reference's bitmap (`public/os/icons/doom.png`); `Icon`
renders bitmap icons for names listed in `BITMAPS`. Credits gain a "Games"
section naming id Software and js-dos/DOSBox. Serving GPL binaries means
offering their source: the Credits link to github.com/caiiiycuk/js-dos.

### 3.14b AutoCAD Release 12 (added 2026-10-03)

The owner installed and configured AutoCAD R12 in DOSBox (VGA display,
Microsoft mouse driver, no plotter, file locking off) and supplied the
installed `ACAD` folder with `ACADR12.BAT` and `CONFIG.SYS`. The bundle
`public/autocad.jsdos` (6.6 MB) is that install minus what AutoCAD never loads
at runtime (`SOURCE`, `TUTORIAL`, `R11SUPP`, ADS sources and docs) plus a
`.jsdos/dosbox.conf` taken from the Doom bundle with a clean autoexec:
`mount c .`, `c:`, `call ACADR12.BAT C:\ACAD\SAMPLE\HOUSEPLN`. The batch file
passes its first argument to AutoCAD as the drawing to open, so AutoCAD starts
on the bundled house floor plan (its saved view already fits the screen).
Visitors' edits live in js-dos's in-memory drive and vanish on reload.

Two player details apply to every DOS app. Mouse autolock is on (set after
`run()`, which resets it from the bundle): a click captures the pointer and Esc
releases it, so only the program's own cursor shows and it follows the hand.
And the player's root keeps `position: absolute` against the `relative` utility
class `Dos(root)` adds; without it the canvas sized its own container and the
boot screen grew a few pixels a frame until it filled the window.

DRY: Doom and AutoCAD are the same thing — a bundle in `DosPlayer` on black —
so `apps/doom/` (the loader and player) moves to `apps/dos/`, `apps/Doom.tsx`
becomes `apps/dos-app.tsx` with `dosApp(bundleUrl, displayName)` returning the
component, and the registry holds both, sharing one `DOS_CHROME`: AutoCAD as
"AutoCAD Release 12" (shortcut "AutoCAD"), opening by shape rather than size:
`aspect: 4 / 3` makes `initialRect` give it the Showcase window's height and
the width its 640×480 VGA screen needs (1159×920 on the 1280×1024 desk; the
chrome is `WINDOW_CHROME`, 10 px across and 58 px down), the same status and
bar colour as Doom, and
a pixel icon of the boot-screen mark (`public/os/icons/autocad.png`). Credits'
"Games" section becomes "DOS software" with an Autodesk row.

The startup banner shows the licensee the installed copy carries; this is
AutoCAD's own screen and is not altered.

### 3.15 Screen effects (added 2026-10-03)

The reference's smudge/static/shadow planes become CSS layers inside the
CSS3D screen element (`.screen-fx`, `features/desk/screen-fx.css`): a
vignette, the soft pink/green colour band around 60 % of the width, soft
scanlines, a static tile (a seeded 128² noise PNG made once with a canvas,
`features/desk/noise.ts`, stepped by a CSS animation), an inline-SVG
fractal-noise smudge layer, and the reference's sub-pixel `jitter` on the
iframe. The overlay is `pointer-events: none`, fades in only once the iframe
has loaded (before that the slab is a powered-off CRT gradient), and all
animation stops under `prefers-reduced-motion`. The reference's whole-canvas
film grain was tried and dropped: on the page's dark paper it speckled.

### 3.16 Brand and icons (added 2026-10-03)

The baked computer texture carried the reference's "Heffernan / henry inc"
logo on the monitor bezel; it is erased in place (median filter over the
band, which keeps the baked shading) and the owner's name is drawn in the
same spot and orientation with `sharp`. The site's favicon and touch icons are
the reference's computer icon.

## 4. Performance

Mandatory, and the reason for most choices above:

- Baked `MeshBasicMaterial`, no lights, no shadows, ~11 k triangles total.
- Render on demand: zero GPU work while the pointer rests and no transition
  runs; none at all while the figure is off screen.
- Pixel ratio capped at 2; the canvas is the box's size (no oversampled stage).
- Payload: `three` core + `GLTFLoader` + `CSS3DRenderer` (tree-shaken, loaded
  only when the figure nears the viewport) and ~1.5 MB of assets, replacing the
  4.5 MB scene and the streaming Spline runtime.
- The OS is DOM: no canvas, no heavy fonts, CSS Modules; one `setInterval`
  (clock) at 30 s.

Budget to check manually: desk → monitor transition at a steady 60 fps on an
integrated GPU laptop; `performance.memory` flat after five transitions; first
frame within 1.5 s on a fast connection after the chunk loads.

## 5. Testing

Vitest (`tests/unit/**`, jsdom only where React or DOM is involved):

- `desk/ease.test.ts`: bezier endpoints and monotonicity, the quintic midpoint.
- `desk/keyframes.test.ts`: aspect correction, parallax smoothing, reduced-motion.
- `desk/monitor-focus.test.ts`: the `over / pressed / focused` reducer, including leave-while-pressed.
- `desk/monitor-screen.test.ts`: occluder and bezel transforms from `SCREEN` (three's math classes run in node).
- `desk/pixel-ratio.test.ts`: cap, floor, non-finite fallback.
- `os/window-manager.test.ts`: open / focus / minimise / toggle / close ordering.
- `cms/mappers.test.ts`: updated for the removed scene fields.

Playwright (`tests/e2e`):

- `support.ts` holds back `**/*.glb` instead of `**/*.splinecode`.
- `layout.spec.ts` figure tests: 3:2 box and caption while the GLB is slow; collapse when it fails; the "Open the desktop" link points at `/os`.
- `os.spec.ts`: `/os` boots to a desktop with the Showcase window; the taskbar lists it; minimise hides it and the tab restores it; a shortcut double-click opens Credits; dragging the title bar moves the window.
- `figure.spec.ts`: with the GLB allowed, the figure box contains an `iframe[title="Desktop"]` and a canvas with `data-loaded="true"` (software WebGL in headless Chromium is slow but works for one frame).

`bun run lint`, `check-types`, `test`, `build` pass.

## 6. Out of scope

Sound, the free camera, the far idle orbit, screen static / smudge layers,
DOS games, CMS schema removal, a Spline → GLB export of the current desk.

## 7. Success criteria

- The figure shows the baked desk with a live, usable OS on its monitor; hover
  zooms to the screen, leaving zooms back; windows drag, minimise, close.
- `/os` works on its own, including on phones.
- No frame is rendered while nothing moves or while the figure is off screen.
- All checks and tests pass; the Spline runtime and scene are gone.
