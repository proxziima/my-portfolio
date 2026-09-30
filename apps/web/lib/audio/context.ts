let ctx: AudioContext | null = null

/** Lazily created on the first user gesture and shared by every sound (autoplay policy). */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // audio is decoration; a browser that refuses a context just stays silent
  }
}

export function safely(play: (ctx: AudioContext) => void): void {
  const c = audioContext()
  if (!c) return
  const run = () => {
    try { play(c) } catch { /* audio is decoration; never break the interaction */ }
  }
  // A suspended context has a frozen clock: schedule only once it is running, or the sound is lost.
  if (c.state === 'suspended') c.resume().then(run, () => {})
  else run()
}
