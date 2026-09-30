import { audioContext, safely } from './context'
import { thump } from './thump'

const BULB_URL = '/sound/bulb-explode.mp3'

let buffer: AudioBuffer | null = null
let loading: Promise<void> | null = null

/** Decodes the bulb sample once, through the shared context; safe to call any number of times. */
export function preloadBulb(): void {
  const t = audioContext()
  if (!t || buffer || loading) return
  loading = fetch(BULB_URL)
    .then((r) => r.arrayBuffer())
    .then((ab) => t.decodeAudioData(ab))
    .then((buf) => { buffer = buf })
    .catch(() => { loading = null })
}

/** The bulb bursting: the sample (or a plain `Audio` until it is decoded) over a sine thump from 100 to 36Hz. */
export function playBulb(): void {
  safely((t) => {
    const n = t.currentTime
    if (buffer) {
      const s = t.createBufferSource()
      const g = t.createGain()
      s.buffer = buffer
      g.gain.value = 0.9
      s.connect(g).connect(t.destination)
      s.start(n)
    } else {
      try {
        const a = new Audio(BULB_URL)
        a.volume = 0.9
        void a.play().catch(() => {})
      } catch { /* the thump below still plays */ }
    }
    thump(t, n)
  })
}
