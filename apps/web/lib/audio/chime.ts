import { safely } from './context'

/** G4 C5 E5 G5: four soft rising notes. */
const NOTES = [392, 523.25, 659.25, 783.99]
const STEP = 0.18
const PEAK = 0.12

/** A short "power on" chime in place of the reference's (Microsoft-owned) startup sample. */
export function playChime(destination?: AudioNode): void {
  safely((ctx) => {
    const out = destination ?? ctx.destination
    const t0 = ctx.currentTime + 0.05
    NOTES.forEach((frequency, i) => {
      const t = t0 + i * STEP
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(1e-4, t)
      gain.gain.exponentialRampToValueAtTime(PEAK, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(1e-4, t + 1.2)
      osc.connect(gain).connect(out)
      osc.start(t)
      osc.stop(t + 1.25)
    })
  })
}
