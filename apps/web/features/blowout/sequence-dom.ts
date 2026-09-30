/** The blowout's DOM pieces (template `blowout1.js`): overlays, the falling ghost, shards, the smoke puff, the remount. */
import type { Body, Shard } from './physics'
import type { Scope } from './scope'

export interface Point { x: number; y: number }
export interface ShardEl { el: HTMLElement; state: Shard; out: boolean }

const SHARD_COUNT = 16
const PUFF_COUNT = 11
const px = (n: number) => `${n}px`

/** A full-screen layer whose radial gradient is centred on the switch. */
export function overlay(scope: Scope, className: string, center: Point): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.style.setProperty('--x', px(center.x))
  el.style.setProperty('--y', px(center.y))
  return scope.own(el)
}

/** Clones the switch (canvas pixels included) into a fixed `.bo-fall` over it, and hides the mounted one. */
export function detachGhost(scope: Scope, switchEl: HTMLElement, rect: DOMRect): HTMLElement {
  const ghost = switchEl.cloneNode(true) as HTMLElement
  ghost.className = 'bo-fall'
  ghost.removeAttribute('id')
  ghost.removeAttribute('data-anchor')
  ghost.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'))
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, { left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) })
  copyCanvas(switchEl, ghost)
  scope.own(ghost)
  switchEl.style.opacity = '0' // not visibility: the ghost is the one on screen now
  switchEl.style.pointerEvents = 'none'
  return ghost
}

// cloneNode copies the canvas element but not what is drawn on it
function copyCanvas(from: HTMLElement, to: HTMLElement): void {
  const source = from.querySelector('canvas')
  const target = to.querySelector('canvas')
  if (!source || !target) return
  try { target.getContext('2d')?.drawImage(source, 0, 0) } catch { /* the <img> fallback frames came along with the clone */ }
}

export function placeGhost(ghost: HTMLElement, b: Body, rect: DOMRect): void {
  ghost.style.transform = `translate(${(b.x - rect.left).toFixed(1)}px,${(b.y - rect.top).toFixed(1)}px) rotate(${b.angle.toFixed(3)}rad)`
}

export function spawnShards(scope: Scope, center: Point): ShardEl[] {
  return Array.from({ length: SHARD_COUNT }, () => {
    const el = document.createElement('div')
    el.className = 'bo-shard'
    const size = 3 + Math.random() * 5
    el.style.width = px(size)
    el.style.height = px(size * (0.6 + Math.random()))
    const a = Math.random() * Math.PI * 2
    const speed = 260 + Math.random() * 520
    const state: Shard = { x: center.x, y: center.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 260, angle: 0, spin: (Math.random() - 0.5) * 24, life: 1 }
    const shard = { el, state, out: false }
    placeShard(shard) // placed before it is attached, so it never shows a frame in the corner
    scope.own(el)
    return shard
  })
}

export function placeShard(s: ShardEl): void {
  s.el.style.transform = `translate(${s.state.x}px,${s.state.y}px) rotate(${s.state.angle}rad)`
  if (!s.out) s.el.style.opacity = String(Math.max(0, s.state.life))
}

export function fadeShards(shards: ShardEl[]): void {
  for (const s of shards) {
    s.out = true
    s.el.style.transition = 'opacity .4s'
    s.el.style.opacity = '0'
  }
}

/** A puff of smoke where the switch was. */
export function puff(scope: Scope, center: Point): void {
  for (let i = 0; i < PUFF_COUNT; i++) {
    const e = document.createElement('span')
    e.className = 'bo-puff'
    const a = (i / PUFF_COUNT) * Math.PI * 2 + Math.random() * 0.6
    const d = 8 + Math.random() * 26
    const size = 26 + Math.random() * 30
    Object.assign(e.style, { width: px(size), height: px(size), left: px(center.x - size / 2), top: px(center.y - size / 2) })
    scope.own(e)
    const dx = Math.cos(a) * d
    const dy = Math.sin(a) * d - 10
    const anim = scope.animate(e, [
      { transform: 'translate(0,0) scale(.3)', opacity: 0 },
      { transform: `translate(${dx * 0.6}px,${dy * 0.6}px) scale(1)`, opacity: 0.85, offset: 0.18 },
      { transform: `translate(${dx * 1.6}px,${dy * 1.8 - 22}px) scale(1.7)`, opacity: 0 },
    ], { duration: 720 + Math.random() * 320, easing: 'cubic-bezier(.16,.7,.3,1)', fill: 'forwards' })
    if (anim) anim.onfinish = () => scope.release(e)
  }
}

/** Shows the mounted switch again; it scales back in from inside the puff. */
export function remount(scope: Scope, switchEl: HTMLElement, reduce: boolean): void {
  restoreSwitch(switchEl)
  switchEl.style.transformOrigin = '50% 50%'
  if (reduce) return
  scope.animate(switchEl, [
    { transform: 'scale(.45)', opacity: 0 },
    { transform: 'scale(1.09)', opacity: 1, offset: 0.62 },
    { transform: 'scale(1)', opacity: 1 },
  ], { duration: 420, delay: 90, easing: 'cubic-bezier(.2,1.1,.3,1)', fill: 'backwards' })
}

export function restoreSwitch(switchEl: HTMLElement): void {
  switchEl.style.opacity = ''
  switchEl.style.pointerEvents = ''
}
