/**
 * The frames sent to the worker and not back yet, each with what its arrival must apply (the
 * CSS3D pose of the very camera it was drawn with). At most `max` in flight: a full ring means
 * "skip this frame, the loop stays dirty", so a busy worker slows the scene down instead of
 * queueing stale poses behind it.
 */
export class FrameRing<T> {
  private next = 1
  private readonly pending = new Map<number, T>()
  constructor(private readonly max = 3) {}

  /** The id to send, or null when full. */
  push(entry: T): number | null {
    if (this.pending.size >= this.max) return null
    const id = this.next++
    this.pending.set(id, entry)
    return id
  }

  /** The frame `id` arrived: its entry, and every older one dropped (a newer frame supersedes them). */
  settle(id: number): T | null {
    const entry = this.pending.get(id) ?? null
    for (const key of this.pending.keys()) if (key <= id) this.pending.delete(key)
    return entry
  }

  get inFlight(): number {
    return this.pending.size
  }
}
