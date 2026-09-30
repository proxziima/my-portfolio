export const ATLAS = { src: '/theme-switch/rocker-atlas.webp', frames: 17, columns: 5, width: 212, height: 280 } as const

export const isValidAtlas = (w: number, h: number) =>
  w === ATLAS.width * ATLAS.columns && h === ATLAS.height * Math.ceil(ATLAS.frames / ATLAS.columns)

export const frameAt = (progress: number) => Math.round(Math.min(1, Math.max(0, progress)) * (ATLAS.frames - 1))

export const frameOrigin = (n: number) => ({
  sx: (n % ATLAS.columns) * ATLAS.width,
  sy: Math.floor(n / ATLAS.columns) * ATLAS.height,
})

export const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** 200ms per full flip; 115ms when clicks come faster than 300ms apart. */
export const flipDuration = (distance: number, rapid: boolean) => (rapid ? 115 : 200) * Math.abs(distance)
