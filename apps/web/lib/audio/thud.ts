import { safely } from './context'

const LENGTH = 0.09

/** A bulb-shard landing: a short low-passed noise burst over a sine thump. `strength` scales the level. */
export function playThud(strength: number): void {
  safely((t) => {
    const n = t.currentTime
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * LENGTH), t.sampleRate)
    const a = buf.getChannelData(0)
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.exp(-(i / t.sampleRate) * 60)
    const src = t.createBufferSource()
    const lp = t.createBiquadFilter()
    const g = t.createGain()
    src.buffer = buf
    lp.type = 'lowpass'
    lp.frequency.value = 900
    g.gain.setValueAtTime(0.18 * strength, n)
    g.gain.exponentialRampToValueAtTime(1e-4, n + LENGTH)
    src.connect(lp).connect(g).connect(t.destination)
    src.start(n)
    src.stop(n + LENGTH)
    const o = t.createOscillator()
    const og = t.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(95, n)
    o.frequency.exponentialRampToValueAtTime(50, n + 0.08)
    og.gain.setValueAtTime(0.22 * strength, n)
    og.gain.exponentialRampToValueAtTime(1e-4, n + 0.1)
    o.connect(og).connect(t.destination)
    o.start(n)
    o.stop(n + 0.11)
  })
}
