# 3D Scene Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Spline desk scene render only the pixels it displays, and only while it is on screen, so it runs smoothly on phones and laptops.

**Architecture:** A shared `useInView` IntersectionObserver hook (also replacing Figure's hand-rolled observer). A small `scene-pixel-ratio` module: a pure `scenePixelRatio(dpr, fit)` plus `applyPixelRatio(app, ratio)`, the single, feature-detected touch of the runtime's private renderer. `SplineScene` keeps the loaded `Application` in state and wires both in: pixel ratio follows `fit`, and `play()`/`stop()` follow visibility.

**Tech Stack:** Next 16 / React 19 client components, `@splinetool/runtime` 2.0.62, Vitest 5 (jsdom per file), bun.

Spec: `docs/superpowers/specs/2026-10-02-3d-performance-design.md`.

**Conventions (read before starting):**
- All commands run from `apps/web` (`D:\Second Brain\01.PROJETOS\applications\my-portfolio\apps\web`).
- Unit tests live in `tests/unit/**`, `*.test.ts` only (not `.tsx`). React tests use `// @vitest-environment jsdom`, `createElement` (no JSX), `act`, and `createRoot`. Copy the style of `tests/unit/figure/use-fit-scale.test.ts`.
- Code style: no semicolons, single quotes, 2-space indent, short JSDoc that explains *why*. Match the existing files.
- Do not touch `apps/docs/package.json` or `packages/cms-types/src/payload-types.ts`. They have unrelated uncommitted changes, so never `git add -A`.
- Never reset or reseed the Payload database.

## File map

| File | Responsibility |
|---|---|
| Create `lib/dom/use-in-view.ts` | `useInView(ref, { rootMargin, once })`: the app's one IntersectionObserver hook |
| Create `tests/unit/dom/use-in-view.test.ts` | Its tests |
| Modify `features/figure/Figure.tsx` | Use `useInView` in place of its inline observer |
| Create `features/figure/scene-pixel-ratio.ts` | `MAX_PIXEL_RATIO`, `scenePixelRatio`, `applyPixelRatio` |
| Create `tests/unit/figure/scene-pixel-ratio.test.ts` | Its tests |
| Modify `features/figure/SplineScene.tsx` | Hold `app`, apply the fitted pixel ratio, pause off screen |

---

### Task 1: `useInView` hook

**Files:**
- Create: `lib/dom/use-in-view.ts`
- Test: `tests/unit/dom/use-in-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dom/use-in-view.test.ts`:

```ts
// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInView, type InViewOptions } from '@/lib/dom/use-in-view'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** An IntersectionObserver stub that records what it watches and lets the test report an intersection. */
class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | undefined
  readonly observed: Element[] = []
  readonly disconnect = vi.fn()
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.last = this
  }
  observe(target: Element) {
    this.observed.push(target)
  }
  unobserve() {}
  report(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const seen: boolean[] = []
let options: InViewOptions | undefined

function Harness() {
  const ref = useRef<HTMLDivElement>(null)
  seen.push(useInView(ref, options))
  return createElement('div', { ref })
}

let host: HTMLElement
let root: Root
const observer = () => FakeIntersectionObserver.last!

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  FakeIntersectionObserver.last = undefined
  seen.length = 0
  options = undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('useInView', () => {
  it('starts out of view and observes the element', () => {
    act(() => root.render(createElement(Harness)))
    expect(seen.at(-1)).toBe(false)
    expect(observer().observed).toEqual([host.firstElementChild])
  })

  it('follows the element in and out of view', () => {
    act(() => root.render(createElement(Harness)))
    act(() => observer().report(true))
    expect(seen.at(-1)).toBe(true)
    act(() => observer().report(false))
    expect(seen.at(-1)).toBe(false)
    expect(observer().disconnect).not.toHaveBeenCalled()
  })

  it('passes the root margin to the observer', () => {
    options = { rootMargin: '200px' }
    act(() => root.render(createElement(Harness)))
    expect(observer().options?.rootMargin).toBe('200px')
  })

  it('with once, latches true and stops observing on the first intersection', () => {
    options = { once: true }
    act(() => root.render(createElement(Harness)))
    act(() => observer().report(false))
    expect(observer().disconnect).not.toHaveBeenCalled()
    act(() => observer().report(true))
    expect(seen.at(-1)).toBe(true)
    expect(observer().disconnect).toHaveBeenCalledOnce()
  })

  it('disconnects the observer on unmount', () => {
    act(() => root.render(createElement(Harness)))
    const io = observer()
    act(() => root.unmount())
    expect(io.disconnect).toHaveBeenCalledOnce()
    root = createRoot(host)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test -- tests/unit/dom/use-in-view.test.ts`
Expected: FAIL. The import of `@/lib/dom/use-in-view` can't be resolved.

- [ ] **Step 3: Implement the hook**

Create `lib/dom/use-in-view.ts`:

```ts
'use client'
import { useEffect, useState, type RefObject } from 'react'

export interface InViewOptions {
  /** Grows (or shrinks) the viewport the element is tested against, as in IntersectionObserver. */
  rootMargin?: string
  /** Latch on the first intersection and stop observing: for "mount once it comes near". */
  once?: boolean
}

/**
 * Whether the element intersects the viewport, kept current by an IntersectionObserver. Starts false
 * (on the server too, so hydration matches) until the observer's first report.
 */
export function useInView(ref: RefObject<Element | null>, { rootMargin, once = false }: InViewOptions = {}): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setInView(entry.isIntersecting)
        if (once && entry.isIntersecting) io.disconnect()
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, once])

  return inView
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test -- tests/unit/dom/use-in-view.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dom/use-in-view.ts tests/unit/dom/use-in-view.test.ts
git commit -m "feat(web): useInView hook"
```

---

### Task 2: Figure uses `useInView`

**Files:**
- Modify: `features/figure/Figure.tsx` (whole file is 51 lines)

No new test: this is a refactor with the same behaviour. The hook is covered by Task 1, and `bun run test` / `check-types` / `lint` guard the rest.

- [ ] **Step 1: Replace the inline observer**

Replace the whole of `features/figure/Figure.tsx` with:

```tsx
'use client'
import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import { useInView } from '@/lib/dom/use-in-view'
import { useRole } from '@/features/role/RoleProvider'
import styles from './Figure.module.css'

const SplineScene = dynamic(() => import('./SplineScene').then((m) => m.SplineScene), { ssr: false })

/** Mount the scene this far before it scrolls into view. */
const NEAR_MARGIN = '200px'

/**
 * The per-role caption under a lazily mounted Spline scene. The box holds the scene's height while it
 * loads (no layout shift); if the scene is missing or fails, the box goes and the caption stays.
 */
export function Figure({ sceneUrl }: { sceneUrl: string }) {
  const { current } = useRole()
  const box = useRef<HTMLDivElement>(null)
  const near = useInView(box, { rootMargin: NEAR_MARGIN, once: true })
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])

  return (
    <figure className={styles.plate} data-anchor="figure">
      {!failed && (
        <div ref={box} className={styles.box} data-anchor="figure-box">
          {near && <SplineScene url={sceneUrl} onFail={fail} />}
        </div>
      )}
      <figcaption key={current.slug} className={styles.caption}>{current.caption}</figcaption>
    </figure>
  )
}
```

- [ ] **Step 2: Verify**

Run: `bun run test && bun run check-types && bun run lint`
Expected: all pass, with no lint warnings (`--max-warnings 0`).

- [ ] **Step 3: Commit**

```bash
git add features/figure/Figure.tsx
git commit -m "refactor(web): figure mounts the scene through useInView"
```

---

### Task 3: `scene-pixel-ratio` module

**Files:**
- Create: `features/figure/scene-pixel-ratio.ts`
- Test: `tests/unit/figure/scene-pixel-ratio.test.ts`

Background: the scene's canvas is a fixed 857×571 CSS px stage, CSS-scaled by `fit` (≤ 1 on phones, ~0.7 on desktop) into the figure box. The runtime sets the WebGL pixel ratio once at load to `devicePixelRatio`, so the buffer is `1/fit`× wider than what is displayed. Rendering at `dpr × fit` matches the device pixels on screen. The runtime's public API has no pixel-ratio setter. Its internal `_renderer.setPixelRatio` is what the runtime itself calls at load (`build/runtime.js`), and its later resizes go through `_renderer.setSize`, which keeps the ratio.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/figure/scene-pixel-ratio.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { applyPixelRatio, MAX_PIXEL_RATIO, scenePixelRatio } from '@/features/figure/scene-pixel-ratio'

describe('scenePixelRatio', () => {
  it('renders the device pixels the scaled stage covers', () => {
    expect(scenePixelRatio(3, 0.4)).toBeCloseTo(1.2)
    expect(scenePixelRatio(2, 0.7)).toBeCloseTo(1.4)
  })

  it('caps the ratio on large high-density screens', () => {
    expect(MAX_PIXEL_RATIO).toBe(2)
    expect(scenePixelRatio(3, 1)).toBe(2)
  })

  it('falls back to 1 when the inputs make no ratio', () => {
    expect(scenePixelRatio(2, 0)).toBe(1)
    expect(scenePixelRatio(Number.NaN, 0.5)).toBe(1)
    expect(scenePixelRatio(Number.POSITIVE_INFINITY, 0.5)).toBe(1)
  })
})

describe('applyPixelRatio', () => {
  it('sets the renderer ratio and asks for a frame', () => {
    const setPixelRatio = vi.fn()
    const requestRender = vi.fn()
    applyPixelRatio({ _renderer: { setPixelRatio }, requestRender } as never, 1.2)
    expect(setPixelRatio).toHaveBeenCalledWith(1.2)
    expect(requestRender).toHaveBeenCalledOnce()
  })

  it('does nothing when the runtime internals are missing', () => {
    const requestRender = vi.fn()
    expect(() => applyPixelRatio({ requestRender } as never, 1.2)).not.toThrow()
    expect(() => applyPixelRatio({ _renderer: {}, requestRender } as never, 1.2)).not.toThrow()
    expect(requestRender).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test -- tests/unit/figure/scene-pixel-ratio.test.ts`
Expected: FAIL. The module can't be resolved.

- [ ] **Step 3: Implement the module**

Create `features/figure/scene-pixel-ratio.ts`:

```ts
import type { Application } from '@splinetool/runtime'

/** Above 2× this scene looks no sharper; the cap bounds the cost on large high-density screens. */
export const MAX_PIXEL_RATIO = 2

/**
 * The WebGL pixel ratio that renders exactly the device pixels the stage covers once it is scaled by
 * `fit` into the figure box (`devicePixelRatio` alone oversamples by 1 / fit: ~2.5× on a phone).
 */
export function scenePixelRatio(devicePixelRatio: number, fit: number): number {
  const ratio = devicePixelRatio * fit
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(MAX_PIXEL_RATIO, ratio) : 1
}

/** The one runtime internal we rely on: the renderer the runtime itself sets the ratio on at load. */
interface RendererInternals {
  _renderer?: { setPixelRatio?: (ratio: number) => void }
}

/**
 * Sets the loaded scene's pixel ratio. The runtime has no public option for it, so this reaches the
 * internal renderer, feature-detected: if a runtime upgrade moves it, the scene keeps the runtime's
 * default ratio rather than breaking.
 */
export function applyPixelRatio(app: Application, ratio: number): void {
  const renderer = (app as unknown as RendererInternals)._renderer
  if (typeof renderer?.setPixelRatio !== 'function') return
  renderer.setPixelRatio(ratio)
  app.requestRender()
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test -- tests/unit/figure/scene-pixel-ratio.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add features/figure/scene-pixel-ratio.ts tests/unit/figure/scene-pixel-ratio.test.ts
git commit -m "feat(web): fitted, capped pixel ratio for the spline scene"
```

---

### Task 4: Wire it into `SplineScene`

**Files:**
- Modify: `features/figure/SplineScene.tsx` (whole file is 68 lines)

No unit test: the component drives a WebGL runtime that jsdom can't run. Its two new behaviours are thin effects over units already tested in Tasks 1 and 3. Task 5 verifies them in the browser.

- [ ] **Step 1: Replace the component**

Replace the whole of `features/figure/SplineScene.tsx` with the following. The changes: the `STAGE` comment; `app` state in place of `loaded`; `useInView`; two new effects.

```tsx
'use client'
import { Application } from '@splinetool/runtime'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useInView } from '@/lib/dom/use-in-view'
import { applyPixelRatio, scenePixelRatio } from './scene-pixel-ratio'
import { useFitScale } from './use-fit-scale'
import { useHideSplineTextProxy } from './use-hide-spline-text-proxy'
import styles from './SplineScene.module.css'

/** The frame the scene is composed for: the desktop column at 3:2. */
const FRAME = { width: 600, height: 400 }
/**
 * How far the camera pulls back from that frame (< 1 shows more). Not `app.setZoom`: the scene's
 * camera is orthographic, where `setZoom` sets an absolute zoom clamped to the scene's limits
 * (0.3–0.48 around its 0.35), so it can't pull back this far. The stage renders the frame / zoom
 * instead and is scaled into the box.
 */
const SCENE_ZOOM = 0.7
/**
 * About 857×571 CSS px, scaled into the box by `fit`. Its WebGL buffer is sized to the device pixels it
 * covers after that scaling, not to the full stage × devicePixelRatio (see scene-pixel-ratio.ts).
 */
const STAGE = { width: FRAME.width / SCENE_ZOOM, height: FRAME.height / SCENE_ZOOM }

/**
 * The Spline scene, client-only, driven through the runtime directly rather than
 * `@splinetool/react-spline`, for what the wrapper doesn't expose:
 * - `renderer: 'webgl'`: on the auto-selected WebGPU pipeline this scene logs pipeline and
 *   shadow-texture validation errors (and drops two draws); the WebGL pipeline renders it cleanly
 * - a load rejection (missing file, unparsable scene), which the wrapper rethrows during render.
 *   `onFail` lets the figure collapse to its caption
 * - the loaded app itself: its pixel ratio follows the fit, and it stops rendering while off screen.
 */
export function SplineScene({ url, onFail }: { url: string; onFail: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [app, setApp] = useState<Application | null>(null)
  const fit = useFitScale(stageRef, STAGE.width)
  const visible = useInView(stageRef)
  useHideSplineTextProxy()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let live = true
    let instance: Application | undefined
    try {
      const loading = new Application(canvas, { renderMode: 'auto', renderer: 'webgl' })
      instance = loading
      loading.load(url).then(
        () => { if (live) setApp(loading) },
        () => { if (live) onFail() },
      )
    } catch {
      onFail()
    }
    return () => {
      live = false
      setApp(null)
      instance?.dispose()
    }
  }, [url, onFail])

  useEffect(() => {
    if (app) applyPixelRatio(app, scenePixelRatio(window.devicePixelRatio, fit))
  }, [app, fit])

  // nothing to see off screen: stop the render loop (and its events) until the stage scrolls back
  useEffect(() => {
    if (!app) return
    if (visible && app.isStopped) app.play()
    else if (!visible && !app.isStopped) app.stop()
  }, [app, visible])

  return (
    <div ref={stageRef} className={styles.stage} style={{ ...STAGE, '--fit': fit } as CSSProperties}>
      <canvas ref={canvasRef} data-loaded={app !== null} aria-hidden="true" />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `bun run test && bun run check-types && bun run lint`
Expected: all pass. If lint flags `setApp(null)` in the effect cleanup, keep it: it stops the other effects from touching a disposed app when `url` changes. Add a one-line `// eslint-disable-next-line <rule>` with that reason only if the rule is an error.

- [ ] **Step 3: Commit**

```bash
git add features/figure/SplineScene.tsx
git commit -m "perf(web): fit the spline scene's pixel ratio and pause it off screen"
```

---

### Task 5: Verify in the running app

**Files:** none. If a check fails, report it with evidence. Don't patch around it here.

- [ ] **Step 1: Start the apps**

The web app reads content from Payload (port 3001). From the repo root, `bun run dev` starts both through turbo (web on 3000). Wait until `http://localhost:3000` serves the page with the desk scene.

- [ ] **Step 2: Check the buffer size**

In the browser at `http://localhost:3000`, after the scene fades in, evaluate:

```js
const c = document.querySelector('canvas[data-loaded="true"]')
;({ dpr: devicePixelRatio, ratio: c.width / c.clientWidth, fit: c.getBoundingClientRect().width / c.clientWidth })
```

Expected: `ratio ≈ min(2, dpr × fit)`, not `dpr`. Repeat with mobile emulation (375×812; reload after switching). Expected at dpr 3: ratio ≈ 1.2 or less, not 3.

- [ ] **Step 3: Check the pause**

Scroll the figure fully out of view, then evaluate a frame counter:

```js
await new Promise((r) => { let n = 0; const c = document.querySelector('canvas[data-loaded="true"]'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const draw = gl.drawElements.bind(gl); gl.drawElements = (...a) => { n++; return draw(...a) }; setTimeout(() => { gl.drawElements = draw; r(n) }, 1000) })
```

Expected: `0` while off screen. Scroll back into view and move the mouse over the scene: the count is > 0, and the scene responds (cursor, hover) as before.

- [ ] **Step 4: Report**

Report the measured values for desktop and mobile emulation, and any console errors from the runtime.
