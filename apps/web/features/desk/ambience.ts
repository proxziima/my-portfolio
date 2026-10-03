/** The office ambience as the camera hears it: cutoff and level from the camera's distance to the desk. */
export interface Ambience {
  frequency: number
  volume: number
}

const map = (v: number, a0: number, a1: number, b0: number, b1: number) => b0 + ((b1 - b0) / (a1 - a0)) * (v - a0)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The reference's mapping: far from the desk it is bright and present, zoomed into the monitor it goes quiet and muffled. */
export const ambienceParams = (distance: number): Ambience => ({
  frequency: clamp(map(distance, 0, 10000, 100, 22000) - 3000, 100, 22050),
  volume: clamp(map(distance, 1200, 10000, 0, 0.2), 0.05, 0.1),
})
