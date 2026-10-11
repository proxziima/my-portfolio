# PageSpeed: load the letter fast without losing the desk — design

Date: 2026-10-10. Branch `perf/pagespeed` (based on `feat/observability`).
Plan: `docs/superpowers/plans/2026-10-10-pagespeed.md`.

## 1. Problem

PageSpeed Insights on production (`felipevinicius.me`), as reported by the owner:

| | Perf | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|---|
| Mobile | 79 | 0.9 s | 1.5 s | 870 ms | 0 | 3.2 s |
| Desktop | 64 | 0.2 s | 0.4 s | 1,170 ms | 0.152 | 1.2 s |

Accessibility, Best Practices and SEO are 100 and must stay there.

The owner's direction, which this design follows: fix things at the cause, plan for the long term,
lose no quality. Three things are ruled out: replacing the CRT static videos with CSS or canvas
noise, putting work off only to get it outside Lighthouse's measurement window, and removing or
weakening features.

### 1.1 Measured baseline (this branch, `scripts/perf/lighthouse.ts`, Lighthouse 13.5.0, median of 3)

Raw reports and summaries are in the session scratchpad under `perf/baseline/`. Every later
checkpoint uses the same script (§10).

| Run | Form | Perf | FCP | LCP | TBT | CLS | SI | Bytes |
|---|---|---|---|---|---|---|---|---|
| Local build, Lighthouse defaults | mobile | 84 | 908 ms | 3,616 ms | 290 ms | 0 | 1,529 ms | 1,536 KiB |
| Local build, Lighthouse defaults | desktop | 100 | 247 ms | 639 ms | 43 ms | 0 | 546 ms | 8,393 KiB |
| Production, PSI-calibrated CPU | mobile | 74 | 1,145 ms | 4,066 ms | 496 ms | 0 | 3,118 ms | 1,944 KiB |
| Production, PSI-calibrated CPU | desktop | 85 | 253 ms | 549 ms | 345 ms | 0 | 499 ms | 8,877 KiB |
| Local build, PSI-calibrated CPU | mobile | 70 | 909 ms | 3,744 ms | 769 ms | 0 | 1,590 ms | 2,180 KiB |
| Local build, PSI-calibrated CPU | desktop | 91 | 246 ms | 654 ms | 239 ms | 0 | 585 ms | 8,069 KiB |
| Local build, real (devtools) throttling | mobile | 85 | 1,856 ms | 1,856 ms | 586 ms | 0.001 | 1,895 ms | 2,050 KiB |
| Local build, real (devtools) throttling | desktop | 99 | 211 ms | 211 ms | 143 ms | 0 | 334 ms | 9,000 KiB |
| Production, `scripts/perf/layout-shifts.ts` (CPU ×6, 150 ms, 1.6 Mb/s, 1350×940) | desktop | | | | | **0.148** (3/3 runs) | | |

The layout-shift recorder reproduces PageSpeed's desktop CLS exactly (0.148 against PSI's 0.152);
§4.1 has the cause.

This workstation's Lighthouse benchmark index is about 2,600 to 3,500, against roughly 1,000 to 1,500
on PageSpeed's hosts. With Lighthouse's default CPU multipliers the local desktop scores 100, so
local numbers only mean something relative to each other. `--calibrate` scales the CPU multiplier
by the benchmark ratio, which gets closer to PageSpeed but not all the way there. Production PSI
stays the ground truth, and every phase ends with a PSI run on production (§10).

### 1.2 Where the time and the bytes go (from the reports)

- **Main thread, production desktop (calibrated):** script evaluation 1,138 ms, "Other" 364 ms,
  style and layout 200 ms. By script: the React DOM framework chunk `0df-…` 667 ms, of which
  538 ms is script evaluation, and almost all of that is **hydration of the whole letter**
  (React attributes rendering work to its own chunk). The three.js chunk `0upzdq…` takes 490 ms,
  with one 343 ms long task as the engine is created and the models, textures and shaders arrive
  on the main thread. The document itself takes 366 ms: parsing the HTML and the RSC payload. The
  `/os` iframe takes another 93 ms in its own document and runs on the same thread.
- **The `/os` iframe boots a second Next app during the page load.** Its page chunk is **914 KB
  minified** (`2-f9u…`). It carries the Messenger's `eve/react` client and all of zod, imported
  statically through `features/os/apps.ts`, even though the Messenger is only opened by a
  double-click.
- **posthog-js sits in the initial bundle** (`3bkg…`/`2pgs…`, about 103 KB transferred, 90 KB of
  it unused at load). It loads even when analytics is switched off (no token), because
  `lib/analytics/init.ts` and `events.ts` import it statically.
- **Bytes, desktop:** `static-layer.mp4` 4.49 MB and `static-base.mp4` 2.88 MB are 7.37 MB of a
  roughly 8.9 MB page. **Both MP4s carry an AAC audio track at about 316 kb/s** (1.19 MB and
  0.24 MB) on a layer that is always muted. Then `smudges.jpg` (293 KB), the textures (decor
  149 KB, computer 110 KB, environment 75 KB), the GLBs (113, 85 and 95 KB) and the Inter woff2
  (75 KB).
- **Videos:** both are H.264 Main 640×480 at 29.97 fps. `static-base` is 6.07 s (182 frames) of fine
  noise with a coloured vertical streak. `static-layer` is 30.03 s (900 frames): tear lines and
  bands in its first seconds, then mostly dark with occasional bars. Its content changes across the
  whole 30 s, so there is no shorter loop inside it. On mobile they are only fetched once the
  figure is on screen (`play()` follows visibility), but `preload="metadata"` still fetches the
  container on desktop the moment the scene mounts, and both files then stream in full while the
  CRT layers are still invisible (they stay at opacity 0 until the OS shows its desktop).
- **Render-blocking CSS:** 3 small stylesheets (about 9 KB gzipped in total).
- **"Legacy JavaScript" (13.9 KB flagged):** these are Next.js's own built-in polyfills,
  `next/dist/build/polyfills/polyfill-module.js` (`trimStart/End`, `flat/flatMap`,
  `Object.fromEntries`, `Array.prototype.at`, `Object.hasOwn`, `URL.canParse`), which Next always
  bundles into the framework chunk whatever the Browserslist. The real code is under 1 KB; 13.9 KB
  is Lighthouse's per-script estimate. Separately, `Math.trunc` is flagged in posthog-js's own build.
- **Unused JS (340 KB flagged):** three (94 KB of 160 KB unused at load), posthog-js (90 of
  103 KB), the Next runtime (25 of 43 KB) and React DOM (24 of 73 KB).
- **Cache:** the CMS favicons are served with no cache lifetime. Everything under `public/` gets
  Next's default `max-age=0` revalidation.
- **CLS:** 0 in every simulated Lighthouse run. Simulated throttling measures CLS on an unthrottled
  load, so the fonts arrive before first paint and nothing moves. The layout-shift recorder with
  real CDP throttling against production gives **0.1484 in 3/3 runs**, a single shift at
  1.6 to 4.4 s. The bio's paragraphs and the figure all move up 24 px: `figure` 674→650, the bio
  `p`s 302→278, 414→390 and so on. Laying the page out with the woff2 blocked versus loaded
  isolates it: **with `Inter Fallback` (Arial plus next/font's size-adjust), the first bio
  paragraph wraps to 4 lines (96 px) instead of 3 (72 px)**. When Inter arrives, it reflows to 3
  lines and everything below moves 24 px. It is not hydration: the server layout and the hydrated
  layout are identical, measured at 1350 and 390. Production also preloads **two** fonts in the
  `Link` header, Inter (75 KB) and Caveat (48 KB, used only by Curious mode), plus both rocker
  images. On a slow link, Caveat delays Inter and makes the swap later and the shift likelier.

## 2. Findings that change the approved plan

| Approved item | Finding | Long-term alternative adopted |
|---|---|---|
| (5) "explicit aspect-ratio reserve for the figure box" | The box already reserves 3:2 (`Figure.module.css`, `aspect-ratio: 3 / 2`, and the layout e2e test asserts it). The box never resizes. It *moves*, by exactly one bio line (24 px), because the first bio paragraph wraps to one more line in the fallback face (§1.2). | No change to the box. Fix the line-count difference at its source (§4.1). |
| (5) "next/font fallback metric overrides for all fonts" | `next/font/google` already generates an override fallback by default (`adjustFontFallback: true`: Arial with one `size-adjust` from Inter's average width), and `next/font/local` defaults to `'Arial'`. It exists and is still not close enough: one average-width factor against Arial's glyph widths leaves the first paragraph one line longer at 600 px. Caveat is preloaded on every page although only Curious mode uses it. | Replace the single generic fallback with **per-platform matched fallbacks** (Segoe UI, Roboto, Helvetica Neue, Arial, each with its own `size-adjust`/`ascent-override`/`descent-override`/`line-gap-override` from font metrics), add a **line-count equivalence gate** over every role's bio and headline at 390/768/1440, stop preloading Caveat, and use a measured escalation if the gate cannot be met (§4.1). |
| (7) "modern browserslist dropping legacy polyfills" | Next 16's default target is already `chrome 111, edge 111, firefox 111, safari 16.4`. The flagged polyfills are Next's hard-wired `polyfill-module`, which no Browserslist removes. | No Browserslist change. Patching Next would be a workaround. Accept the finding, record it, and recheck on each Next upgrade. The posthog-js `Math.trunc` flag leaves the critical path with posthog's lazy load (§6.3). |
| (7) "private source maps" | Private maps do not clear Lighthouse's "missing source maps" diagnostic, which only public maps satisfy. That diagnostic is informational and not scored; Best Practices is already 100. | Private maps for PostHog error symbolication, built and then deleted from `.next/static` before the image is assembled. The diagnostic stays visible and that is by design (§4.3). |
| (3) "seamless loop trim" | `static-layer` changes across all 30 s and `static-base` is a 6 s loop. Trimming would remove content. | No trim. The pipeline checks the loop seam (first against last frame) and only reports it (§4.4). |
| (4) "KTX2/Basis textures" | Measured with `ktx2-encoder` (Basis WASM, no `toktx`): UASTC+RDO+zstd gives 1.55, 1.56 and 1.20 MB against WebP's 110, 149 and 75 KB, **13× the download**. ETC1S is 366, 354 and 326 KB but blocks visibly on baked-lighting gradients, which fails parity. The main-thread cost KTX2 was meant to remove (image decode and upload) comes from `TextureLoader` decoding `<img>` on the main thread, not from the format. | Textures stay compressed images (AVIF with WebP fallback, parity-gated), loaded with three's `ImageBitmapLoader`, which decodes off the main thread on both hosts. In the worker host (§8), upload happens off the main thread too. KTX2 is documented as rejected, with the numbers. |
| (4) "meshopt/Draco" | Meshopt with 16-bit quantization (dedup, prune, weld, quantize, meshopt): computer 113→45 KB, decor 85→40 KB, environment 95→36 KB (−59 %). The Meshopt decoder is a few KB of JS with embedded WASM and works in workers. Draco's decoder is about 300 KB of WASM to save a few KB more on tiny meshes. | Meshopt only. |
| (6) "Server Components + islands" | Hydration is where the framework chunk's 538 ms goes, so a smaller client tree pays off directly. The *bundle* saving is small, though: the bulk of unused JS is posthog and three. | Keep (6). Add **posthog-js lazy loading** and **OS app code-splitting** (Messenger, Conversation, Credits, DOS player), which remove about 100 KB from the letter's critical path and most of the 914 KB from the iframe's boot (§6). |
| (1) "three.js in a worker via OffscreenCanvas … input/resize/visibility forwarding" | The monitor's screen is a **CSS3D DOM layer (the iframe) composited under the WebGL canvas**, kept aligned by sharing one camera. With `transferControlToOffscreen`, the worker's canvas commits on its own schedule, so during the 2 s camera zoom the GL bezels and occluder hole would drift a frame behind the DOM screen and show a light sliver at the screen edge. | The camera rig and CSS3D stay on the main thread (cheap). The worker renders into its own `OffscreenCanvas` and sends `transferToImageBitmap()` frames back. The main thread applies each bitmap (`bitmaprenderer`, zero-copy) **in the same task** as the CSS3D transform for that frame's camera, so the two layers never drift. Pointer input never needs forwarding because the rig is on the main thread (§8). |
| (2) "boot on intent" (owner refined it to "boot on approach") | The iframe has keyboard (Tab focuses it and zooms the camera) and touch roles that hover alone does not cover. `useFullscreen` binds Escape inside the iframe only when full screen is entered, so an iframe mounted later is missed. | An explicit power state machine. Triggers: pointer entering the figure, keyboard focus, the monitor ≥ 50 % in view on touch, and full screen. A focusable powered-off screen hands focus to the iframe, and the full-screen Escape listener gets a rebind key (§7). |

## 3. Goals and non-goals

**Goals.**
- Production PSI: mobile ≥ 90, desktop ≥ 90.
- CLS ≤ 0.05 under real throttling (owner decision: the ~0.045 desktop font-swap residual is accepted, §4.1).
- TBT under 200 ms (mobile) and 150 ms (desktop) in PSI.
- Page weight at load under 1.5 MB on desktop (from 8.9 MB).
- Visual parity on the desk, the figure and the CRT layers, verified (§9).
- `desk_scene` and `os_boot` stay correct, with their semantics documented.

**Non-goals.**
- Changing any visual or interaction.
- Replacing the CRT videos.
- Tuning the twin agent or the CMS. The CMS favicon cache headers are a follow-up in `apps/payload`, noted in §11.

## 4. Phase 1: stable layout, delivery, video, assets

### 4.1 Stable layout (5)

Measured cause (§1.2): the fallback face wraps the first bio paragraph to one more line. When
Inter swaps in, everything below that paragraph moves 24 px, the figure included. The fixes, in
order, each gated by measurement:

1. **Per-platform matched fallbacks.** `next/font/google` is configured with
   `adjustFontFallback: false`, and the layout's font stack becomes
   `var(--font-inter), 'Inter Fallback Segoe', 'Inter Fallback Roboto', 'Inter Fallback Helvetica', 'Inter Fallback Arial', sans-serif`.
   Each fallback family is one `@font-face` with `src: local('<system font>')` and that font's own
   `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override`. A `local()` that
   is missing makes that family unusable, so the browser falls through to the next family, and each
   platform gets the closest system font with overrides computed *for that font*. This is the
   technique Capsize and fontaine use. The values are generated by a committed script,
   `scripts/fonts/fallbacks.ts`, from `@capsizecss/metrics` (system font metrics) and Inter's
   metrics read from the shipped woff2 with `fontkit`, and written to
   `styles/font-fallbacks.css` (generated, committed). The script tunes `size-adjust` not with a
   letter-frequency average but by measuring, in Playwright's Chromium, the rendered widths of
   *the site's own text* (every discipline's bio and headline from the CMS seed, at weights 400,
   430, 500 and 620) in Inter and in each fallback, then solving for the factor that minimises the
   largest relative line-width error.
2. **Caveat is not preloaded** (`preload: false`). Only Curious mode's notes use it. The preload
   competes with Inter on slow links, which is what makes the swap late enough to be seen.
3. **Line-count equivalence gate** (`tests/e2e/font-fallback.spec.ts`): for every discipline (from
   the drum), at 390, 768 and 1440 wide, it lays the page out with the woff2 blocked (fallback) and
   with it loaded, and asserts that every bio paragraph and the `h1` have the same height in both.
   It runs in CI's Chromium on Linux (fallback: Arial, i.e. Liberation Sans, which is metric-identical)
   and locally on Windows (Segoe UI). This test reproduces today's bug: it fails on `main` at 1440
   for the default role.
4. **If the gate fails, stop (owner decision):** the font loading strategy never changes
   automatically. `display: 'optional'` is **not** applied. If the tuned per-platform fallbacks
   still fail the gate for some role and width, the implementer stops and reports:
   - the failing cases (role, width, platform fallback, paragraph, line count in each face);
   - the measured residual shift: `layout-shifts.ts` CLS at 1350×940 and 412×823, against the
     production local build;
   - the corrections tried.

   The owner then decides between the options, each with its cost: `display: 'optional'` (first
   slow visits keep the fallback), inlining the font (about 75 KB more in every HTML response),
   reserving space (spacing changes), or accepting the residual shift.

   **Owner decision (2026-10-10): accept the residual.** After tuning, the gate holds every
   paragraph's line count, but words still move inside equal-height paragraphs when Inter swaps
   in: local CLS (CPU ×6, 1.6 Mb/s) 0.1484 → 0.0449 at 1350×940 and 0.0017 at 412×823. The font
   loading strategy stays as it is: no `display` change and no inlined font. CLS gates are
   ≤ 0.05 accordingly (this section, §3, §10 and the plan).
5. **The figure stays a fixed-ratio box** (already true). Its caption row gets `min-height` of one
   line, so a caption swap between roles never moves the sections below. That is a role-change
   shift, not load CLS, but it is the same class of bug.

Verification: `scripts/perf/layout-shifts.ts` (committed with this design) against the local build
and, after deploy, against production, with CPU ×6, 150 ms and 1.6 Mb/s at 1350×940 and 412×823:
CLS ≤ 0.05 in 3 of 3 runs (the accepted font-swap residual is ~0.045 at 1350×940). Today: 0.148.

### 4.2 Delivery: inline CSS, caching (7)

- `experimental.inlineCss: true` (documented in the installed Next 16.3.4 docs,
  `01-app/03-api-reference/05-config/01-next-config-js/inlineCss.md`; production builds only,
  global). Our CSS is about 9 KB gzipped, which is the case the docs recommend inlining for. The
  trade-off is acceptable here: every page is `force-dynamic`, so the HTML is never cached anyway,
  and returning visitors re-download about 9 KB gzipped per view. CSS for `next/dynamic` chunks
  (the desk scene) still arrives as a `<link>` at runtime, after load, and blocks nothing.
  Verified by checking that the HTML has `<style` and no `rel="stylesheet"` link for the layout CSS.
- **Immutable media.** The asset pipeline (§4.5) writes content-hashed files to `public/assets/`.
  `next.config.js` `headers()` serves `/assets/:path*` with
  `Cache-Control: public, max-age=31536000, immutable`. Unhashed public files (js-dos runtime,
  `.jsdos` bundles, icons) get `public, max-age=3600, stale-while-revalidate=86400`, so a deploy
  is visible within the hour and repeat visits revalidate in the background.
  `_next/static` is already immutable.
- **No Browserslist change** (§2).

### 4.3 Private source maps (7)

`productionBrowserSourceMaps: true` (Turbopack honours it: `turbopackSourceMaps` defaults to the
flag). A post-build script, `scripts/sourcemaps.ts`, runs after `next build`:

1. If `POSTHOG_CLI_TOKEN` and `POSTHOG_CLI_ENV_ID` are set, run
   `posthog-cli sourcemap inject --directory .next/static` and then `… upload`, which gives PostHog
   Error Tracking symbolicated stacks for `capture_exceptions`.
2. **Always** delete `*.map` under `.next/static`, and the `//# sourceMappingURL` comments that
   point at them, so no map is ever served. Both comment forms are matched: JS's
   `//# sourceMappingURL=a.js.map` and the CSS form Turbopack writes with no space before the
   closing `*/` (`/*# sourceMappingURL=a.css.map*/`), with the blank lines before it; the unit test
   uses verbatim tails of `next build` CSS as fixtures. `inlineCss` copies each stylesheet's text
   into the client reference manifests during `next build`, before this script runs, and renders
   `<style>` from there, so the same comment is also stripped from every
   `*_client-reference-manifest.js` under `.next/server` and its `.next/standalone` copy (traced
   `node_modules` skipped). Verified on a build: no `.next/static` CSS or JS contains
   `sourceMappingURL`, nor does the HTML of `/` or `/os`. Known residual: the prerendered
   not-found page (`_not-found.html`/`.rsc`) keeps one comment, because there the CSS sits in a
   length-prefixed RSC text row that the script must not rewrite; it disappears if Turbopack stops
   appending map comments to inlined CSS (no upstream issue exists yet).
3. Delete the TypeScript source copy Turbopack 16.3 emits for `new Worker(new URL('./desk.worker.ts',
   import.meta.url))` into `.next/static/media`. No vercel/next.js issue covers it (searched
   2026-10-10); the exit condition is `removed 0 source copies` in the build log.

In the Dockerfile, the build step mounts the token as a BuildKit secret
(`RUN --mount=type=secret,id=posthog_cli_token,env=POSTHOG_CLI_TOKEN …`). With no secret the
upload is skipped and the maps are still deleted, so the image is identical either way and
nothing leaks into layers. `scan-client-bundle` (CI) runs after the script, so it scans exactly
what ships. `@posthog/nextjs-config` was evaluated and rejected: it wraps the Next config and runs
the same CLI, but adds a build-time dependency on PostHog credentials inside `next build` itself,
which conflicts with the runtime-configured image. The CLI is run as
`bunx @posthog/cli@0.18.10`, pinned (its npm package downloads a native binary in `postinstall`,
which bun does not run for untrusted dependencies, so it is not a workspace dependency).

### 4.4 CRT static videos (3)

Visual parity is required, so every encode is chosen by a measured gate, not by eye alone.

- **Audio dropped** (`-an`): lossless, −1.43 MB, the same pixels.
- **Resolution stays 640×480** (the source). The `<video>` layout box is the 1280×1024 screen
  element, and in full screen at 2× the screen is up to about 2,200 device px tall. Every render
  size is at or above the source, so encoding at the source size loses nothing and upscaling gains
  nothing.
- **Three encodes per clip**, chosen with `<source>` (the first playable one wins):
  `video/webm; codecs="av01.0.04M.08"` (SVT-AV1, `tune=0:enable-tf=0` so temporal filtering does
  not smear the grain), `video/webm; codecs="vp09.00.30.08"` (libvpx-vp9, `-arnr-maxframes 0`),
  and `video/mp4; codecs="avc1.4D401E"` (libx264 `-tune grain`, `+faststart`). Safari without AV1
  hardware reports no AV1 support and falls through to VP9 or H.264.
- **CRF found by search, per clip and codec**: bisect the CRF (AV1 16 to 40, VP9 16 to 40, H.264 14
  to 28) for the highest value that passes the parity gate. The gate, computed by
  `scripts/assets/parity/video.ts` on **frame-aligned** decodes (both sides decoded to y4m by frame
  index; the first experiment showed timestamp-matched comparison mis-aligns WebM against the
  source by a frame and caps SSIM at about 0.989 whatever the CRF):
  - *Composited parity* (what the visitor sees): each frame is composited the way `screen-fx.css`
    does (veil `#000` at 0.14, then the layer `plus-lighter` at its opacity, 0.5 base or 0.1 fine)
    over a fixed 640×480 capture of the OS desktop, for both the source and the encode. Thresholds:
    **SSIM ≥ 0.995 and VMAF ≥ 95** on the composite.
  - *Layer statistics* (grain must not be smoothed): per-frame luma mean within ±2 %, luma
    standard deviation ≥ 97 % of the source's, and high-frequency energy (std of a 3×3 Laplacian)
    ≥ 95 % of the source's.
  - *Frame count* identical, and *loop seam* (SSIM of last against first frame) reported.

  Measured so far, frame-aligned and raw-layer only: AV1 `static-layer` 389 KB at CRF 24 (SSIM
  0.9982, VMAF 91.6) against 4.49 MB; AV1 `static-base` 74 KB at CRF 24 (raw VMAF 80) and H.264
  `-tune grain` CRF 18 1.64 MB (raw VMAF 91). The raw base layer is pure noise, which full-reference
  metrics punish whatever the encoder, so the composited gate and the statistics are the binding
  criteria for it. Expected delivery: about 0.4 to 0.8 MB AV1, against 7.37 MB.
- **Fetch only when visible.** The CRT layers are invisible until the OS shows its desktop
  (`data-ready`), and with §7 the desktop exists only after the approach trigger. The `<source>` elements are
  attached the first time the layers turn ready, with `preload="auto"` from then on.
  `play`/`pause` keep following the figure's visibility as today.
- **Human review gate:** an A/B page (`scripts/assets/parity/review.html`, local only) plays source
  and encode side by side and toggles them blind. The owner signs off in the PR.

### 4.5 Build-time asset pipeline (4)

`bun run assets:build` (in `apps/web`) is a committed, re-runnable script. Its outputs are committed
to `public/assets/`, so the Docker build needs no encoder.

```
apps/web/assets-src/                 committed sources, never served
  desk/{computer,decor,environment}.glb
  desk/{computer,decor,environment}.webp      (the textures' only sources: 2048² WebP)
  desk/screen/{static-base,static-layer}.mp4, smudges.jpg, shadow.png
  desk/audio/*.mp3
  blowout/bulb-explode.mp3                    (was public/sound/: now hashed and immutable too)
  fonts/Millennium{,-Bold}.ttf                (→ app/(os)/fonts/*.woff2, no ASSETS entry)
  theme-switch/{rocker-on,rocker-off,rocker-atlas}.webp
apps/web/scripts/assets/
  build.ts            entry: runs every recipe; --only <id>, --check
  recipes.ts          one declarative entry per asset (kind, source, outputs, parity thresholds)
  stages/image.ts     sharp → AVIF + WebP at the recipe's widths (DOM <picture>, textures)
  stages/model.ts     gltf-transform: dedup, prune, weld, quantize(16-bit), meshopt
  stages/video.ts     ffmpeg (system, verified) → AV1/VP9/H.264 with the CRF search
  stages/copy.ts      hashed passthrough (audio)
  parity/image.ts     SSIM (ffmpeg ssim filter) vs source, composited where the recipe says so
  parity/video.ts     §4.4 gate
  hash.ts             sha256 → 10-char content hash → name.<hash>.<ext>
  manifest.ts         writes lib/assets/manifest.ts (generated, committed) + assets-src/manifest.lock.json
  tools.ts            locates ffmpeg ≥ 7 with libsvtav1, libvpx-vp9, libx264, libvmaf; else fails with install hints
```

- **Generated manifest.** Code never hard-codes asset paths. It imports `ASSETS` from
  `lib/assets/manifest.ts`, for example
  `ASSETS.desk.computer.model` → `'/assets/desk/computer.3f9a1c2b7e.glb'`, or a `{ avif, webp }`
  variant set for textures and `<picture>`. Renaming or re-encoding an asset changes the hash, so
  the immutable cache is always correct.
- **Reproducibility.** `manifest.lock.json` records each output's source sha256, recipe hash and
  tool versions. `bun run assets:check` recomputes the source and recipe hashes, needs no encoders,
  and runs in CI: it fails if a source or recipe changed without a rebuild, if an output file is
  missing, if a hashed output's bytes no longer match the hash in its file name (a hand-edited file
  would keep its immutable URL), if `lib/assets/manifest.ts` differs from what the lock generates
  (line endings aside), or if `public/assets` holds a file no lock entry lists (an orphan; a full
  `assets:build` removes them). A stage may produce no manifest value: the OS fonts are built and
  checked like any output but have no `ASSETS` entry, because `next/font/local` only takes a
  literal path; a unit test holds the layout's paths to the font stage's recorded outputs. Encoders: sharp (npm prebuilt), gltf-transform and meshoptimizer (npm, WASM), ffmpeg
  (system). **ffmpeg decision:** a system ffmpeg ≥ 7 is required only to *rebuild* videos (one-time
  install: `winget install Gyan.FFmpeg`, `brew install ffmpeg` or `apt install ffmpeg`). This machine
  has 8.1.1 (gyan.dev full build) with libsvtav1, libaom-av1, libvpx-vp9, libx264 and libvmaf.
  `ffmpeg-static` was rejected: its `postinstall` downloads a ~70 MB binary on every install
  (CI, Docker) for a step only the owner runs, and its builds lag behind (6.x).
- **Images.**
  - `smudges.jpg` (2048×1638, 293 KB): recipe AVIF and WebP at 1280 and 2048 w, under
    `<img srcset sizes="1280px">` inside the screen element (the layout width is the fixed 1280 CSS
    px screen; CSS3D only transforms it). **As built, the 1280 w variants were dropped by the
    pipeline's own rules**: AVIF 1280 w passed the composited gate only at 248,637 bytes, not less
    than the 2048 w AVIF (237,633 bytes at q54, SSIM 0.99812), and no WebP ≥ q80 passed SSIM ≥ 0.998
    below the source's 292,727 bytes, so the source JPEG passes through as the fallback. Shipped:
    AVIF 2048 w, JPEG 2048 w.
  - The still layers (shadow, smudges) get their candidates only when the screen powers on
    (§5), so nothing downloads while they are invisible.
  - `shadow.png` (845×676 RGBA, 67 KB): AVIF and WebP at source size (probe: AVIF 1.7 KB, WebP
    34 KB).
  - Rocker fallbacks (530×700 shown at 2.8 rem): AVIF and WebP at 64 and 128 w,
    `sizes="2.8rem"` (probe: about 2.4 KB each, against 10.5 KB).
  - The atlas stays WebP (the canvas loads it with `new Image()`, which has no `<picture>`
    fallback) at a parity-gated quality.
  - Gates: image SSIM ≥ 0.99 against the source. Smudges are judged composited at their 0.12
    `plus-lighter` opacity, SSIM ≥ 0.998. Shadow is judged composited over the screen slab.
- **Textures.** AVIF and WebP at 2048² (the size the full-screen monitor uses), each gated at
  SSIM ≥ 0.995 against the source WebP, since the source is already lossy and generation loss is
  the risk. If AVIF cannot pass at a smaller size than the source WebP, the recipe keeps the source
  WebP bytes, hashed. Loaded with `ImageBitmapLoader` (`imageOrientation: 'none'`,
  `premultiplyAlpha: 'none'`); `flipY = false` as today. The AVIF/WebP choice is made by decoding
  a 1×1 AVIF with `createImageBitmap` **in the context that decodes the textures**: the worker
  probes before it fetches (or the main thread, when it draws), since a window and a worker need
  not agree. It is cached per context, and the worker reports the format it used (§8.2).
- **Models.** Meshopt as measured (§2), quantization `position: 16, texcoord: 16` (12-bit UVs
  would be a quarter texel on 2048² textures). `MeshoptDecoder` from
  `three/addons/libs/meshopt_decoder.module.js` is set on the `GLTFLoader`. Gate: the model parity
  screenshots (§9) at 1440 and 390, desk and monitor poses, pixel diff ≤ 0.5 % of pixels over
  ΔE 2.
- **No transcoder files to serve** (KTX2 rejected); the meshopt decoder is bundled JS.

## 5. Videos, textures, models: runtime wiring

- `monitor-screen.ts` builds `<video>` elements with three `<source>` children from
  `ASSETS.desk.screen.staticBase` / `staticLayer` once fx turns ready (§4.4). The smudges and the
  shadow are `<picture>`s built empty at mount; `powerOn()` gives them their candidates (the AVIF
  `<source>` first, then the `<img>`'s `srcset`/`src`) alongside the iframe, so they download
  during the OS's boot console. The CRT layers' fade-in (`data-ready`) waits until both are
  decoded (`img.decode()`; a failed decode never holds them back), so no frame shows the layers
  with a still missing. Verified in Chromium frame by frame, with the stills throttled to arrive
  well after the desktop: 0 frames with the layer visible and a still not loaded.
- `assets.ts` (`loadDesk`): `GLTFLoader().setMeshoptDecoder(MeshoptDecoder)` plus
  `ImageBitmapLoader` for textures (`new Texture(bitmap)`, `needsUpdate`), the same `drop`
  handling and the same unlit material. On dispose, `bitmap.close()`. The texture choice
  (`deskAssetUrls`) lives in the loader-free `desk-assets.ts` and runs in the drawing thread.
- The light switch's rocker atlas (1060×1120 WebP) is fetched and decoded with
  `createImageBitmap(blob)` (default options: the same pixels `drawImage` takes from an `<img>`,
  verified identical in Chromium), off the main thread; the `<img>` path stays where the API is
  missing.

## 6. Phase 2b: smaller client tree and bundles (6)

### 6.1 The letter as Server Components with client islands

`features/portfolio/Portfolio.tsx` becomes a Server Component. The boundary:

| Piece | Kind | Why |
|---|---|---|
| `Portfolio` | server | composition only |
| `RoleProvider`, `CuriousProvider` | client (providers) | role and curious state; server children pass through as `children` |
| `LightSwitch` (new) | client | `WallSwitch` + `useBlowout` + `blowout.css`, the only users of `switchRef`/`reduce` in today's root |
| `RoleHeadline` | client | drum and picker. The name `<span className="who">` moves out to the server `h1`, and the client island renders only `.what` |
| `Bio` | client | word morph, curious toggle |
| `Figure` | client | per-role caption, the scene |
| `EntryList` ×3 | client | filters by role, keyed re-entry |
| `CuriousOverlay` | client | live measurement |
| `ContactLinks`, `FooterNav`, `Section`, `ChipLink` | **server** | static; today they hydrate because a client root imports them |

`useReducedMotion` moves into `LightSwitch`. Hydration work shrinks by the static subtree, which
is what dominates the framework chunk's 538 ms.

### 6.2 OS app code-splitting

`features/os/apps.ts` registers `component: lazyApp(() => import('./apps/messenger/Messenger'))`
for the Messenger, Conversation, Credits and the DOS apps (`dosApp` keeps its `DosPlayer` import
behind the lazy boundary). `lazyApp` wraps `React.lazy`, and `Window` renders children inside
`<Suspense fallback={<WindowLoading />}>`. That fallback is an empty panel in the window's face
colour: the window chrome draws at once and the content follows. Showcase stays eager, because it
is the boot app. Result: the iframe's boot chunk no longer includes `eve/react` and zod.

The OS's local faces ship as raw TTF (`Millennium.ttf` 22 KB, `Millennium-Bold.ttf` 20 KB). The
asset pipeline converts them once to WOFF2 (`wawoff2`, WASM). `app/(os)/fonts/*.woff2` replace the
TTFs, and the TTF sources move to `assets-src/fonts/`.

### 6.3 posthog-js loaded lazily

`lib/analytics/events.ts` keeps `track`/`trackOnExit` synchronous. Before posthog is loaded they push
to a bounded in-memory queue (100 events), which is flushed in order once `initPostHog` resolves.
`initPostHog` becomes `async` and does `const { default: posthog } = await import('posthog-js')`.
The `Analytics` effect calls it exactly where it does today, after hydration. With no token there is
no import at all. Web vitals stay correct: posthog's web-vitals capture uses buffered
`PerformanceObserver` entries, so FCP, LCP and CLS that happened before load are still reported.
`trackOnExit` before load is **queued like any event** (as built): a hidden tab often comes back,
and the flush still goes out as a beacon; a page that truly unloads first loses it, as no code is
left to send it. With no token (or if the posthog-js chunk fails to load), `disable()` empties the
queue and sets a disabled state that `send` checks, so later `track`/`trackOnExit` calls are dropped
at once instead of piling up for a client that never comes. Tests cover the queue, the order, the
exit events and the disabled path.

Bundle analysis: `ANALYZE=true bunx next build` with `@next/bundle-analyzer@16.4.0` is not needed;
Turbopack writes `.next/diagnostics`. Instead, the plan's checkpoint lists chunk sizes with
`scripts/perf/chunks.ts`, which maps chunks to modules from the Turbopack chunk source, and asserts
that the letter's initial JS contains neither `posthog-js` nor `three`, and that the `/os` boot chunk
does not contain `eve/react`. It also loads `/` in Chromium, brings the desk on screen, waits for
its first frame with the models and reads the window's resource timeline (which holds no worker
request): with the worker drawing, no main-thread chunk may contain `THREE.WebGLRenderer` or
`THREE.GLTFLoader`, and the desk must have drawn in its worker (otherwise the check would be
vacuous). `?deskHost=main` loads them, as it should.

## 7. Phase 2a: the monitor boots on approach (2)

Owner decision: "boot on approach". With a pointer or keyboard, the OS boots when the pointer
enters the desk/figure area or keyboard focus reaches it. On touch devices it boots when the
monitor scrolls into view. The powered-off CRT shows only until that trigger, and **on mobile the
screen must never sit dark while the visitor is looking at it**.

### 7.1 State machine (`features/desk/power.ts`, pure)

```ts
export type Power = 'off' | 'booting' | 'on'
export type IntentSource = 'pointer' | 'focus' | 'visible' | 'fullscreen'
export type PowerEvent = { type: 'intent'; source: IntentSource } | { type: 'loaded' }

export function reducePower(state: Power, event: PowerEvent): Power {
  switch (event.type) {
    case 'intent':
      return state === 'off' ? 'booting' : state
    case 'loaded':
      return state === 'booting' ? 'on' : state
  }
}
```

There is no transition back to `off`: once powered, the OS stays, as today.

### 7.2 Approach triggers (`features/desk/intent.ts`, `watchApproach(box, screen, touch, onApproach)` → cleanup; fires once)

`touch` is `matchMedia('(hover: none)').matches`, read once when the scene mounts.

| Source | Mode | Signal | Why |
|---|---|---|---|
| `pointer` | pointer devices | `pointerenter` on the figure box with `pointerType` `mouse` or `pen` | The pointer approaching the monitor. It fires well before the pointer reaches the screen, so the OS hydrates during the approach and not during the zoom. |
| `focus` | all | `focusin` on the screen element | Tab reaches the powered-off screen, which is the iframe's old tab stop |
| `visible` | touch only | IntersectionObserver on the figure box: `intersectionRatio ≥ 0.5`, at once, with no dwell timer | Touch has no hover. The monitor in view means it is being looked at, so it must not stay dark. It fires at load if the figure is already half visible (a short phone viewport scrolled to it, or a reload part-way down), which is correct: the visitor is looking at it. |
| `fullscreen` | all | `Figure`'s Full screen button | Full screen exists to use the OS |

There is no tap trigger: on touch, `visible` has always fired before a tap on the monitor is
possible.

### 7.3 Powered-off screen

The CSS3D screen element (today's slab with the `#243436 → #0b0f10` radial gradient, a powered-off
tube) exists from engine creation, exactly as now, so the desk looks the same. While `off` it is
`tabIndex = 0`, `role = 'img'`, `aria-label = 'Desktop (powered off)'`. On `booting`, the iframe
is appended (`src = /os`) under it. The OS's own black BIOS boot console is the loading state, and
the CRT layers keep waiting for the desktop (unchanged `gateOnDesktop`). On iframe `load`: dispatch
`loaded`, set the slab's `tabIndex = -1` and remove the label, and **if the slab still has focus,
call `iframe.focus()`**, so a keyboard visitor lands in the OS at the same tab position.

### 7.4 Engine and events changes

- `MonitorScreen` gains `element` (the slab), `powerOn(): HTMLIFrameElement` (idempotent), and
  `iframe: HTMLIFrameElement | null`.
- `watchScreen(screenElement, getIframe, onChange, onInput)` takes enter, leave, focus and blur from
  the **slab** (`pointerenter`/`pointerleave`/`focusin`/`focusout`), so hovering the powered-off
  screen still zooms. It binds the inner window's press and key listeners on each iframe `load`, as
  today.
- `DeskScene` owns the power reducer. It receives `fullscreen` as a prop (intent) and exposes
  `power` through `onPower`, so `Figure` can pass it as the rebind key to
  `useFullscreen(box, power)`. The Escape listener inside the iframe is then installed when the
  iframe exists, whichever came first.
- Touch: the iframe keeps `pointer-events: none` under `(hover: none)`. The screen remains a
  picture, and it boots as the monitor scrolls half into view.

### 7.5 Analytics semantics

- `os_boot` (embedded): it still starts when `Desktop` first renders and ends at the desktop. Inside
  the monitor that is now after the approach trigger, so the event no longer competes with the page load, and its
  `ms` is more honest. The tracking plan's notes are updated.
- `os_engaged` (embedded): unchanged.
- No new event.

## 8. Phase 3: the desk renders in a worker (1)

### 8.1 Structure: one scene, two hosts

```
features/desk/
  gl/desk-gl.ts        DOM-free: WebGLRenderer(canvas: HTMLCanvasElement | OffscreenCanvas), models,
                       the screen's GL planes, render(camera), resize, dispose. Imports only three core,
                       GLTFLoader, ImageBitmapLoader, MeshoptDecoder.
  gl/protocol.ts       message types (below); shared by both sides
  gl/desk.worker.ts    worker entry: owns a DeskGl on an OffscreenCanvas, answers messages
  gl/host.ts           interface GlHost, GL_CONTEXT_ATTRIBUTES; gl/select-host.ts: selectHost()
  gl/worker-host.ts    GlHost via Worker + <canvas> 'bitmaprenderer'
  gl/main-host.ts      GlHost via DeskGl on an <canvas> 'webgl2' (fallback); imports desk-gl lazily
  desk-assets.ts       loader-free: DeskAssetUrls + deskAssetUrls(assets, format)
  engine.ts            main thread: CameraRig, CSS3DRenderer, MonitorScreen (CSS3D side), GlHost
```

**What the main thread parses.** With the worker drawing, the main thread loads three's core (the
camera rig and CSS3D need it) but never `WebGLRenderer`, `GLTFLoader` or the meshopt decoder:
`main-host.ts` reaches `desk-gl.ts` only through `import('./desk-gl')`, run when a main host is
created (`?deskHost=main`, no worker support, or failover), and `DeskScene` imports neither the
loaders nor the URL table's texture logic. The main host still knows at once whether WebGL exists:
it creates the context on its canvas with `GL_CONTEXT_ATTRIBUTES` (three's own attributes for the
desk's options) and throws without one; `createDeskGl` asks for the same context and passes it to
`WebGLRenderer({ context })`. Until the scene's code is in, the main host skips frames (the engine
stays dirty and keeps what is on screen) and `load()` waits for it. `perf:chunks` asserts this in
Chromium (§6.3).

`screenPlanes()` (already pure) feeds the GL side. `createMonitorScreen` is split into its CSS3D
DOM part (main thread) and its GL planes (`desk-gl.ts`), at the same transform from `SCREEN`.

### 8.2 Protocol

As built (`gl/protocol.ts`):

```ts
/** Main → worker. */
export type ToWorker =
  /** The canvas the worker draws on; it answers `ready` (a WebGL context) or `unsupported`. */
  | { type: 'init'; canvas: OffscreenCanvas }
  /** The desk's files with both texture encodes: the worker probes which one it can decode. */
  | { type: 'load'; assets: readonly DeskAsset[] }
  | { type: 'resize'; width: number; height: number; pixelRatio: number }
  /** Render one frame with this camera; `id` is echoed so the main thread pairs it with its CSS3D pose. */
  | { type: 'render'; id: number; view: Float64Array /* matrixWorld, 16 */; projection: Float64Array /* 16 */ }

/** Worker → main. */
export type FromWorker =
  | { type: 'ready' }                                 // context created
  | { type: 'unsupported' }                           // no WebGL in this worker → main host
  | { type: 'frame'; id: number; bitmap: ImageBitmap; models: boolean }
  | { type: 'loaded'; format: TextureFormat }         // models and textures in the scene, in this encode
  | { type: 'failed'; reason: 'load_error' | 'context_lost' }
```

Differences from the first draft: `load` is its own message (the canvas goes at once, the models
when the engine asks), it carries both encodes so the worker chooses the format in the context
that decodes, and `loaded` reports that choice (every host's `load()` resolves with it). There is
no `dispose` message: disposing terminates the worker, which frees its context with it. Matrices
are `Float64Array`, three's own precision, so neither side rounds them.

Matrices are transferred as copies (`Float64Array` of 16, which is cheap). The worker sets
`camera.matrixWorld.fromArray(view)`, `matrixWorldInverse` (inverted), `projectionMatrix` and
`projectionMatrixInverse`, with `matrixAutoUpdate = matrixWorldAutoUpdate = false`, so its camera is
bit-identical to the one CSS3D used.

### 8.3 Frame pairing (the alignment guarantee)

The main-thread loop (`engine.ts`) stays as today: on-demand rAF, `rig.update(dt)`, and park when
settled. A frame that needs drawing:

1. Snapshot `camera.matrixWorld` and `projectionMatrix` and keep `{ id, matrices }` in a small ring
   (at most 3 in flight; while 3 are pending, skip posting and mark dirty).
2. `post({ type: 'render', id, view, projection })`.
3. On `frame` for `id`, **in the same message task**:
   `bitmapCtx.transferFromImageBitmap(bitmap)`, then copy the stored matrices into the CSS3D
   camera and call `css.render(cssScene, cssCamera)`. Both DOM mutations land in the same paint.

Under load (a busy worker or a busy main thread), both layers wait together. The worst case is one
frame of extra latency, never misalignment. `models: true` on the first such frame triggers
`onFirstFrame`, which is `desk_scene` ready, exactly where it fires today.

### 8.4 Host selection and fallback

`selectHost()`: if `typeof OffscreenCanvas === 'function'`,
`'transferToImageBitmap' in OffscreenCanvas.prototype` and `typeof Worker === 'function'`, start the
worker and wait for `ready` or `unsupported`, with a 3 s timeout. `unsupported`, a timeout or a
worker `error` falls back to the main host; this is not a failure. The main host failing to create
a context is `webgl_unavailable`, as today (still synchronous: the context is created before the
scene's code is imported, §8.1). A failover keeps the worker's last frame, with the CSS3D layer at
its pose, until the main host can draw a frame with as much in it (models included if they were
shown), and swaps the canvases in that commit; the main host's lazy import only lengthens that
wait. Safari 17+ supports WebGL in workers; older Safari and any browser without it get the main
host with identical visuals.

### 8.5 What stays on the main thread, and why

The camera rig (a few vector lerps per frame), CSS3D (DOM), pointer, resize, visibility and audio.
Nothing is forwarded except `resize` (CSS size and capped pixel ratio) and per-frame matrices.
Visibility needs no message: off screen, the main loop stops posting `render`, so the worker stops
too. `pixel-ratio.ts` is unchanged.

### 8.6 Analytics

`experience_ready`/`experience_failed` for `desk_scene` gain `host: 'worker' | 'main'`
(`AnalyticsEvents` type, catalog doc, tracking plan). Start and ready are unchanged. A worker-side
load failure maps to the same `load_error`. A lost context (new: today it is not handled) reports
`context_lost` and collapses the figure, as a load error does.

## 9. Quality parity verification

1. **Asset gates** (automated, in the pipeline): §4.4 (video), §4.5 (images, textures, models).
2. **Scene screenshots** (`tests/e2e/visual/desk-parity.spec.ts`, run on demand, not in CI because
   it needs WebGL; `PARITY=1`): at 1440×900 and 390×844, light and dark, three shots per size:
   the desk pose at rest, the monitor pose (hover the screen and wait for the rig to settle), and
   full screen. Videos are paused at `currentTime = 0`, the pointer is parked at rest, and the OS
   is held on its desktop. Baselines are captured **before** Phase 1 into
   `tests/e2e/visual/baseline/` (committed). Comparison: `pixelmatch` (threshold 0.1, anti-aliasing
   ignored) with a pass at ≤ 0.5 % differing pixels and no differing cluster larger than 64 px²
   (connected components), so the rule catches a sliver at the screen edge while tolerating GPU
   noise. Diff images are written next to the report.
3. **Composited CRT check:** the same spec, with videos playing, takes 10 frames at fixed
   `currentTime` values (seek, `requestVideoFrameCallback`) and compares them to baseline frames
   captured from the original MP4s at the same times, with SSIM ≥ 0.98 per frame over the screen
   rect (computed in Node with `ssim.js`).
4. **Human review:** the A/B page for videos (§4.4) and the parity diff images, signed off in each
   phase's PR.

## 10. Measurement and budgets

- `apps/web/scripts/perf/lighthouse.ts` (committed with this design): `--serve`, `--runs`,
  `--calibrate`, `--throttling simulate|devtools`, `--compare`. A checkpoint is defined as the
  local calibrated simulate run plus the local devtools run, compared to the baseline, and after
  deploy a PSI run on production (pagespeed.web.dev; the PSI API without a key is quota-limited).
- **Lighthouse CI** (Phase 3, Task 3.6): a `lighthouse` job in `.github/workflows/ci.yml` that
  builds the throwaway CMS (as `live-evals` does: build, migrate, seed on SQLite in `.tmp`) and the
  web app, starts both, runs `scripts/perf/lighthouse.ts --runs 5 --calibrate --lhci` (5 runs per
  form factor, CPU calibrated from the runner's benchmark index) and asserts with
  `@lhci/cli@0.15.1 assert` on the medians. Budgets as built (`lighthouserc.mobile.json`,
  `lighthouserc.desktop.json`), all errors: performance ≥ 0.75 mobile and ≥ 0.9 desktop;
  accessibility, best practices and SEO = 1; CLS ≤ 0.05; TBT ≤ 650 ms mobile and ≤ 150 ms desktop;
  total byte weight ≤ 1,600,000 B; script ≤ 460,000 B. The score floors sit under the measured
  calibrated medians by more than a run's spread, mobile TBT is the Phase 3 median + 25 % and
  desktop TBT the Phase 3 target; production PSI stays the ground truth for the §3 goals
  (`docs/observability.md`, "Performance budgets", has the derivation and the update rule). Reports
  go to the job's artifacts, never to temporary public storage.
- **PostHog alerting** (guidance, executed by the owner): insights on `$web_vitals` for p75 LCP,
  INP and CLS by `$device_type`, with alerts at LCP > 2.5 s, INP > 200 ms and CLS > 0.1, checked
  daily, plus p95 of `experience_ready.ms` for `desk_scene` by `host`.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Worker host's ImageBitmap path changes alpha compositing (premultiplied canvas → bitmap → bitmaprenderer) and the occluder hole looks different | The occluder writes `(0,0,0,0)`, which is identical premultiplied or not. Parity shots of the monitor pose (§9) are the gate. The main host is the fallback switch (`?deskHost=main` for debugging). |
| OS hydration during the camera zoom janks the zoom (main thread) | The `pointer` trigger fires on entering the figure box, well before the screen. The OS boot chunk shrinks (§6.2). In the worker host GL rendering is off-thread, and both layers stall together, never misaligned. |
| On touch, the OS boots as the monitor scrolls into view. It can boot during load if the figure is already half visible (a short viewport or a mid-page reload), and its hydration then competes with the page | That is by design (owner: the screen never sits dark while being looked at). The boot chunk is smaller after §6.2, and Lighthouse's mobile viewport does not have the figure half in view at load. Desktop/pointer visitors who never approach the desk see the powered-off CRT. |
| The font fallback gate cannot be met by tuning | The implementer stops and reports the residual shift for an owner decision. No automatic `display: 'optional'` (§4.1). |
| AV1 decode cost on low-end devices | `<source>` order lets a device without AV1 hardware choose VP9 or H.264 (Chrome uses dav1d in software; at 640×480 that is light). The parity gate is per codec. |
| `inlineCss` is experimental | Isolated in Task 1.3 with a before/after HTML check; reverting it is one line. |
| Encoder differences between machines | Outputs are committed; `manifest.lock.json` records tool versions; `assets:check` guards drift. |
| CMS favicons `max-age=0` | Out of scope here (`apps/payload` media headers); follow-up noted. |
| Lighthouse variance on a fast workstation | Median of 3, calibrated CPU, devtools runs for CLS, and production PSI as ground truth. |

## 12. Rejected alternatives

- CSS/canvas noise instead of the videos (rejected by the owner).
- KTX2/Basis textures (13× the download for UASTC; ETC1S fails parity), see §2.
- Draco (larger decoder for tiny meshes).
- `font-display: optional`, automatically or as a first resort: it removes the shift, but first-time
  visitors on slow links keep the fallback face. It is only one of the options the owner may choose
  if the gate fails (§4.1).
- Tap or dwell triggers on touch (the owner's decision: boot as the monitor scrolls into view, so
  it never sits dark while seen).
- `font-display: block`: invisible text for up to 3 s, which hurts FCP and LCP.
- `transferControlToOffscreen` (layer drift during the zoom, §2).
- Running the rig in the worker and sending poses back (the same drift, the other way round).
- A cross-site iframe for the OS so it runs in its own renderer process under Site Isolation:
  this needs a second domain, a postMessage protocol in place of today's same-origin hooks (desktop
  gating, foley, Escape), and does nothing for Safari. Intent loading removes the contention more
  simply.
- Booting the OS on idle after load (`requestIdleCallback`): that is putting work off to escape the
  measurement window, which is rejected.
- Patching Next's polyfill module; `@posthog/nextjs-config`; `ffmpeg-static`.
