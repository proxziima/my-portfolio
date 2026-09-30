import { safely } from './context'

const LENGTH = 0.065
const SEED = 42
/**
 * Output level. The reference's peak gains (.115 / .105) peak at about -30 dBFS once the bandpass has
 * thinned the noise, which is barely audible on laptop speakers. ×12 (+21.6 dB) peaks near -8 / -10 dBFS.
 */
const CLICK_VOLUME = 12
const PEAK_GAIN = { light: 0.115 * CLICK_VOLUME, dark: 0.105 * CLICK_VOLUME }

type Direction = 'light' | 'dark'

/** The wall switch click: 65ms of LCG noise (seed 42) with a two-spike envelope through a bandpass. */
export function playClick(to: Direction): void {
  safely((t) => {
    const n = t.currentTime
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * LENGTH), t.sampleRate)
    const a = buf.getChannelData(0)
    let o = SEED
    for (let i = 0; i < a.length; i++) {
      o = (o * 16807) % 2147483647
      const w = (o / 2147483647) * 2 - 1
      const s = i / t.sampleRate
      a[i] = w * (Math.exp(-s * 132) + (s > 0.016 ? Math.exp(-(s - 0.016) * 220) * 0.52 : 0))
    }
    const src = t.createBufferSource()
    const bp = t.createBiquadFilter()
    const g = t.createGain()
    src.buffer = buf
    bp.type = 'bandpass'
    const u = to === 'light' ? 1450 : 1050
    bp.frequency.setValueAtTime(u, n)
    bp.frequency.exponentialRampToValueAtTime(u * 0.74, n + LENGTH)
    bp.Q.setValueAtTime(0.72, n)
    g.gain.setValueAtTime(1e-4, n)
    g.gain.exponentialRampToValueAtTime(PEAK_GAIN[to], n + 0.002)
    g.gain.exponentialRampToValueAtTime(1e-4, n + LENGTH)
    src.connect(bp).connect(g).connect(t.destination)
    src.start(n)
    src.stop(n + LENGTH)
  })
}
