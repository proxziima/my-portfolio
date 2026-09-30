let ctx: AudioContext | null = null

/** Lazily created on the first user gesture and shared by every sound (autoplay policy). */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function safely(play: (ctx: AudioContext) => void): void {
  const c = audioContext()
  if (!c) return
  try { play(c) } catch { /* audio is decoration; never break the interaction */ }
}
