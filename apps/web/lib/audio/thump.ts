/** A little low end under the sample: a sine sweeping 100 to 36Hz. */
export function thump(t: AudioContext, n: number): void {
  const o = t.createOscillator()
  const og = t.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(100, n)
  o.frequency.exponentialRampToValueAtTime(36, n + 0.26)
  og.gain.setValueAtTime(0.32, n)
  og.gain.exponentialRampToValueAtTime(1e-4, n + 0.32)
  o.connect(og).connect(t.destination)
  o.start(n)
  o.stop(n + 0.34)
}
