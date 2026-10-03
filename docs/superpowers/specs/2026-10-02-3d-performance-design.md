# 3D scene performance on desktop and mobile — design

Date: 2026-10-02. Supersedes the "accepted GPU cost" note in
`2026-09-29-portfolio-rewrite-design.md` §6.8.

## 1. Problem

The home page's only real-time 3D is the Spline desk scene
(`features/figure/SplineScene.tsx`, `@splinetool/runtime` 2.0.62, WebGL
renderer, `renderMode: 'auto'`). Two costs dominate on every device, and they
are worst on phones:

1. **Oversampled canvas.** The scene's camera is orthographic, so the canvas
   is a fixed 857×571 CSS px stage that is CSS-scaled (`--fit`) into the
   figure box. The runtime sets the WebGL pixel ratio once at load from the
   scene's export settings, which defaults to `window.devicePixelRatio`. On a
   390px-wide 3× phone the box is ~343 CSS px wide (fit ≈ 0.4), so the buffer
   is 2571×1713 for ~1029×686 visible device pixels: about 6× the fragment
   work the screen can show. On a 2× laptop (fit 0.7) it is about 2×.
2. **Rendering while off screen.** The runtime has no visibility handling.
   Its animation loop (`setAnimationLoop`) keeps running while the reader is
   in the Work, Projects or Content sections below. Browsers already throttle
   rAF in hidden tabs, so the cost is only while the page is visible but the
   scene is scrolled away.

The DOM animations (word morph, rocker, blowout, curious overlay, entrances)
already animate only `transform` and `opacity` (plus brief `filter` blurs on a
few words), through WAAPI or scoped rAF, and respect
`prefers-reduced-motion`. They are out of scope.

## 2. Approaches considered

| | Approach | Verdict |
|---|---|---|
| A | **Match the buffer to what is displayed, and pause the loop off screen.** Set the renderer's pixel ratio to `min(devicePixelRatio × fit, 2)` and keep it current as `fit` changes. `app.stop()` when the stage leaves the viewport, `app.play()` when it comes back. | **Chosen.** Removes the two measured costs and changes nothing visible: the buffer still matches the device pixels on screen. Small, isolated code. |
| B | Fix pixel ratio in the Spline editor's export settings (1× on mobile). | Not enough alone. It is per-scene and easy to lose on re-export or a CMS upload, it is a fixed 1× rather than fitted, and it does nothing for the off-screen loop. Still worth doing as a belt-and-braces step (§7). |
| C | Device tiers: a static poster on low-end or Save-Data devices, the live scene elsewhere. | Rejected (YAGNI). There is no poster asset, the scene is interactive (in-scene cursor, typing), and A already brings mobile fragment cost down to what the device displays. |
| D | Prefetch the `.splinecode` in parallel with the runtime chunk, or self-host the runtime's WASM. | Rejected for now. The runtime's `load()` refetches by URL, so a prefetch only helps when cache headers allow reuse, and it risks downloading 4.5 MB twice. The WASM comes from the runtime's CDN on demand. Revisit with field data. |

## 3. Design

### 3.1 Units

**`lib/dom/use-in-view.ts`: `useInView(ref, { rootMargin?, once? }): boolean`**
One IntersectionObserver hook for the app. Returns whether the element
intersects the viewport (expanded by `rootMargin`). With `once`, the hook
latches `true` and disconnects on first intersection. Starts `false` (also on
the server, so hydration matches). No fallback for a missing
`IntersectionObserver`: every supported browser has it, and the current code
already relies on it.
Replaces the hand-rolled observer in `Figure.tsx` (DRY), which becomes
`useInView(box, { rootMargin: NEAR_MARGIN, once: true })`.

**`features/figure/scene-pixel-ratio.ts`**
- `MAX_PIXEL_RATIO = 2`: no visible gain above 2× for this scene, and it
  bounds the cost on large high-DPI screens.
- `scenePixelRatio(devicePixelRatio, fit): number`, a pure function that
  returns `devicePixelRatio * fit` rounded up to a 0.25 step and capped at
  `MAX_PIXEL_RATIO`. The step makes a window drag resize the buffer a few
  times rather than every frame; rounding up never renders below the screen's
  density. A non-finite or non-positive result falls back to `1`.
- `applyPixelRatio(app, ratio): void` is the only place that touches the
  runtime's internals. The public API has no pixel-ratio option, so it calls
  `app._renderer.setPixelRatio(ratio)` and then the runtime's own forced
  resize, `app._resize(true)`. The forced resize is needed because the
  renderer skips `setSize` when the size is unchanged, so a ratio change alone
  leaves the drawing buffer as it was; `_resize(true)` resizes it, updates the
  camera and requests a redraw (plain `requestRender()` does nothing in
  `renderMode: 'auto'`). It is feature-detected and does nothing if either
  internal is missing (e.g. after a runtime upgrade).

**`features/figure/SplineScene.tsx`** (modified)
- Holds the loaded `Application` in state (`app`, set when `load()`
  resolves) in place of the `loaded` boolean. `data-loaded` becomes
  `app !== null`.
- `pixelRatio = scenePixelRatio(devicePixelRatio, fit)` in render; effect on `[app, pixelRatio]`: `applyPixelRatio(app, pixelRatio)`, so it only fires when the quantized ratio changes.
- `const visible = useInView(stageRef)`. Effect on `[app, visible]`: if
  `visible` and `app.isStopped`, `app.play()`; if not visible and not stopped,
  `app.stop()`.
- The doc comment on `STAGE` that says "the runtime has no pixel-ratio option
  to cap it" is updated to point at `scene-pixel-ratio.ts`.

### 3.2 Data flow

```
Figure ── useInView(box, once, 200px) ──▶ mounts SplineScene
SplineScene
  useFitScale(stage) ─▶ fit ─┐
  load() resolves ─▶ app ────┼─▶ applyPixelRatio(app, ratio(dpr, fit))
  useInView(stage) ─▶ visible ┴─▶ app.play() / app.stop()
```

### 3.3 Error handling

- Load failure is unchanged (`onFail` collapses the figure to its caption).
- Missing runtime internals: `applyPixelRatio` does nothing and the scene
  renders at the runtime's default ratio, as today.
- Unmount: `dispose()` as today. The play/stop effect only touches a live,
  loaded `app`.

## 4. Testing

Vitest unit tests (`tests/unit/**`, jsdom where React is involved), following
`tests/unit/figure/use-fit-scale.test.ts`:

- `scene-pixel-ratio.test.ts`: the cap, the fitted product rounded up to 0.25
  steps, the fallback for 0/NaN/Infinity; `applyPixelRatio` calls
  `setPixelRatio` then `_resize(true)`, and does nothing (no throw, no calls)
  when `_renderer`, `setPixelRatio` or `_resize` is missing.
- `use-in-view.test.ts` (fake IntersectionObserver): toggles with
  intersection, latches and disconnects with `once`, passes `rootMargin`,
  disconnects on unmount.

Manual check in the running app: on a 3× mobile emulation, after load,
`canvas.width / canvas.clientWidth ≈ dpr × fit`, not `dpr`. Scrolling the
figure out of view sets `app.isStopped`, and scrolling back resumes rendering.
`bun run lint`, `check-types` and `test` pass.

## 5. Out of scope

DOM animations, scene content and asset size, CDN or cache headers, device
tiers.

## 6. Success criteria

- Fragment work on a 3× phone drops ~6× (buffer ≈ visible device pixels).
- No WebGL frames are rendered while the figure is off screen.
- No visible change to the scene's sharpness, framing or interactivity.

## 7. Follow-up (content, not code)

In the Spline editor, set Export → Pixel Ratio to 1× for mobile. This trims
the first frames rendered before `applyPixelRatio` runs, and covers a scene
loaded without this code path.
