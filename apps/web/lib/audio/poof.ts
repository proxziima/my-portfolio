import { safely } from './context'

const LENGTH = 0.32

/** The soft puff when the lights come back after a blowout. */
export function playPoof(): void {
  safely((t) => {
    const n = t.currentTime
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * LENGTH), t.sampleRate)
    const a = buf.getChannelData(0)
    for (let i = 0; i < a.length; i++) {
      const s = i / t.sampleRate
      a[i] = (Math.random() * 2 - 1) * Math.pow(1 - s / LENGTH, 1.6) * (1 - Math.exp(-s * 260))
    }
    const src = t.createBufferSource()
    const lp = t.createBiquadFilter()
    const g = t.createGain()
    src.buffer = buf
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1600, n)
    lp.frequency.exponentialRampToValueAtTime(220, n + LENGTH)
    g.gain.setValueAtTime(0.001, n)
    g.gain.exponentialRampToValueAtTime(0.28, n + 0.02)
    g.gain.exponentialRampToValueAtTime(1e-4, n + LENGTH)
    src.connect(lp).connect(g).connect(t.destination)
    src.start(n)
    src.stop(n + LENGTH)
  })
}
