/** The blowout's choreography (template `blowout1.js` `run()`): the bulb goes, the switch falls, the lights come back. */
import { playBulb } from '@/lib/audio/bulb'
import { playPoof } from '@/lib/audio/poof'
import { playThud } from '@/lib/audio/thud'
import { applyTheme, explicitTheme } from '@/features/theme/theme-dom'
import { stepBody, stepShard, type Body } from './physics'
import { createScope, type Scope } from './scope'
import { detachGhost, fadeShards, overlay, placeGhost, placeShard, puff, remount, restoreSwitch, spawnShards, type ShardEl } from './sequence-dom'

const RECOVER_AT_MS = 3300
const PHYSICS_MS = 3600
const THEME_BACK_MS = 160
const VEIL_LIFT_MS = 520
const CLEANUP_MS = 1500
const MAX_DT = 0.033

interface RunOptions {
  switchEl: HTMLElement
  reduce: boolean
  /** aborting tears everything down at once and puts the room back */
  signal?: AbortSignal
}

/** Resolves once everything it created is gone (about 4.8s, or right away when aborted). */
export function runBlowout({ switchEl, reduce, signal }: RunOptions): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  const root = document.documentElement
  const previous = explicitTheme()
  const rect = switchEl.getBoundingClientRect()
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const scope = createScope()
  let roomBack = false
  const restoreRoom = () => {
    if (roomBack) return
    roomBack = true
    root.removeAttribute('data-blackout')
    applyTheme(previous, false)
  }

  // the bulb goes
  playBulb()
  const flash = overlay(scope, 'bo-flash', center)
  const veil = overlay(scope, 'bo-veil', center)
  applyTheme('dark', false)
  root.setAttribute('data-blackout', '')
  scope.frame(() => { flash.classList.add('in'); veil.classList.add('in') })

  // the switch comes off the wall, and the glass with it
  const ghost = detachGhost(scope, switchEl, rect)
  const shards = reduce ? [] : spawnShards(scope, center)
  simulate(scope, ghost, shards, rect, reduce)

  return new Promise((resolve) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      scope.dispose()
      resolve()
    }
    const abort = () => { restoreSwitch(switchEl); restoreRoom(); finish() }
    signal?.addEventListener('abort', abort, { once: true })

    // the lights come back: a puff at the mount, the switch back inside it, then the room
    scope.later(() => {
      ghost.classList.add('out')
      fadeShards(shards)
      playPoof()
      if (!reduce) puff(scope, center)
      remount(scope, switchEl, reduce)
      scope.later(restoreRoom, THEME_BACK_MS) // while the veil still hides the room…
      scope.later(() => { veil.classList.remove('in'); veil.classList.add('out') }, VEIL_LIFT_MS) // …which comes back slowly
      scope.later(finish, CLEANUP_MS)
    }, RECOVER_AT_MS)
  })
}

/** Real physics for the ghost and the shards, for 3.6s; under reduced motion the ghost just lies on the floor. */
function simulate(scope: Scope, ghost: HTMLElement, shards: ShardEl[], rect: DOMRect, reduce: boolean): void {
  const floor = innerHeight - rect.height - 4
  if (reduce) {
    ghost.style.transform = `translate(0,${floor - rect.top}px) rotate(.35rad)`
    return
  }
  let body: Body = { x: rect.left, y: rect.top, vx: (Math.random() - 0.5) * 220, vy: -160, angle: 0, spin: (Math.random() - 0.5) * 7 }
  let last = performance.now()
  const stopAt = last + PHYSICS_MS
  const step = (now: number) => {
    // a frame stamped before `last` would give a negative step
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000))
    last = now
    const next = stepBody(body, dt, { minX: 2, maxX: innerWidth - rect.width - 2, floor })
    body = next.body
    if (next.impact !== undefined) playThud(next.impact)
    placeGhost(ghost, body, rect)
    for (const s of shards) {
      s.state = stepShard(s.state, dt, innerHeight - 4)
      placeShard(s)
    }
    if (now < stopAt) scope.frame(step)
  }
  scope.frame(step)
}
